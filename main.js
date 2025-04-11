// Constants
const ICONS_PATH = 'icons/';
const DATA_PATH = 'data/';

// Layer styles
const layerStyles = {
  yfBoundary: { color: '#000', weight: 2, fillColor: '#FFF', fillOpacity: 0.0 },
  buildings: { color: '#A9A9A9', weight: 1, fillColor: '#D3D3D3', fillOpacity: 0.5 },
  majorBuildings: { color: '#000', weight: 0.5, fillColor: '#3f3f3f', fillOpacity: 0.9 },
  parks: { color: '#006400', weight: 1, fillColor: '#90EE90', fillOpacity: 0.5 },
  simaProjects: { color: '#00bfff', weight: 2, fillColor: '#FFFFFF', fillOpacity: 0 },
  survey: { color: '#000000', weight: 0.25 },
  detLayer: { color: '#FF4500', weight: 3, fillColor: '#FFA07A', fillOpacity: 0.05 }
};

// Icons
const nodeIcon = L.icon({ 
  iconUrl: `${ICONS_PATH}loz.svg`, 
  iconSize: [20, 20], 
  iconAnchor: [10, 10], 
  popupAnchor: [0, -10] 
});

const sportsIcon = L.icon({ 
  iconUrl: `${ICONS_PATH}sports.svg`, 
  iconSize: [20, 20], 
  iconAnchor: [10, 10], 
  popupAnchor: [0, -10] 
});

// Loading indicator management
const loadingManager = {
  element: null,
  totalTasks: 0,
  completedTasks: 0,
  loadingText: null,
  
  initialize() {
    this.element = document.getElementById('loading-container');
    this.loadingText = document.querySelector('.loading-text');
  },
  
  addTask() {
    this.totalTasks++;
    this.updateProgress();
  },
  
  completeTask(taskName) {
    this.completedTasks++;
    this.updateProgress(taskName);
    
    if (this.completedTasks >= this.totalTasks) {
      this.hideLoader();
    }
  },
  
  updateProgress(taskName) {
    const percentage = Math.floor((this.completedTasks / this.totalTasks) * 100);
    if (taskName) {
      this.loadingText.textContent = `Loading: ${taskName} (${percentage}%)`;
    } else {
      this.loadingText.textContent = `Loading SIMA data... (${percentage}%)`;
    }
  },
  
  hideLoader() {
    setTimeout(() => {
      this.element.style.opacity = '0';
      setTimeout(() => {
        this.element.style.display = 'none';
      }, 500);
    }, 500);
  }
};

// Create and configure the map
function initializeMap() {
  const map = L.map('map', { attributionControl: false });
  
  // Base maps
  const basemapLayers = {
    "OSM": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }),
    "Basemap": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19
    }),
    "Satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
      maxZoom: 19
    }),
    "White Background": L.tileLayer('', { 
      noWrap: true, 
      minZoom: 0, 
      maxZoom: 19, 
      attribution: '' 
    })
  };
  
  // Add default basemap
  basemapLayers["Basemap"].addTo(map);
  
  // Add controls
  L.control.scale({ 
    position: 'bottomright', 
    imperial: false, 
    metric: true 
  }).addTo(map);
  
  // Add north arrow
  const northArrow = L.control({ position: 'bottomright' });
  northArrow.onAdd = function () {
    const div = L.DomUtil.create('div', 'north-arrow');
    div.innerHTML = `<img src="${ICONS_PATH}north-arrow.svg" alt="North Arrow">`;
    return div;
  };
  northArrow.addTo(map);
  
  return { map, basemapLayers };
}

// Utility functions
async function loadGeoJSON(filename) {
  loadingManager.addTask();
  try {
    const response = await fetch(`${DATA_PATH}${filename}`);
    if (!response.ok) {
      throw new Error(`Failed to load ${filename}`);
    }
    const data = await response.json();
    loadingManager.completeTask(filename);
    return data;
  } catch (error) {
    console.error(`Error loading ${filename}:`, error);
    loadingManager.completeTask(filename);
    return { type: 'FeatureCollection', features: [] };
  }
}

function featuresInsideYF(features, yfPolygon) {
  return features.filter(feature => 
    turf.booleanIntersects(turf.feature(feature.geometry), yfPolygon)
  );
}

function createMaskFromPolygon(yfGeoJSON) {
  const outer = [[[ -180, -90 ], [ -180, 90 ], [ 180, 90 ], [ 180, -90 ], [ -180, -90 ]]];
  const maskCoords = outer.concat(
    yfGeoJSON.features[0].geometry.coordinates.map(ring => 
      ring.map(coord => [coord[0], coord[1]])
    )
  );

  return L.geoJSON({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: maskCoords }
  }, {
    className: 'yf-mask',
    interactive: false
  });
}

// Layer loading functions
class LayerLoader {
  constructor(map) {
    this.map = map;
    this.overlayLayers = {};
    this.yfPolygon = null;
  }
  
  async loadYFBoundary() {
    const yfData = await loadGeoJSON('YF.geojson');
    this.yfPolygon = turf.feature(yfData.features[0].geometry);

    const yfLayer = L.geoJSON(yfData, { 
      style: layerStyles.yfBoundary 
    }).addTo(this.map);
    
    this.overlayLayers["YF Boundary"] = yfLayer;
    this.map.fitBounds(yfLayer.getBounds());
    
    // Create and add YF mask
    const yfMask = createMaskFromPolygon(yfData);
    yfMask.addTo(this.map);
    
    return this.yfPolygon;
  }
  
  async loadGeneralLayers() {
    const layersConfig = [
      { key: 'Buildings', file: 'bhbldg.geojson', style: layerStyles.buildings },
      { key: 'Major Buildings', file: 'maj_b.geojson', style: layerStyles.majorBuildings },
      { key: 'Parks', file: 'parks.geojson', style: layerStyles.parks },
      { key: 'SIMA Projects', file: 'sima.geojson', style: layerStyles.simaProjects },
      { key: 'Survey', file: 'surv.geojson', style: layerStyles.survey }
    ];

    for (const { key, file, style } of layersConfig) {
      const data = await loadGeoJSON(file);
      const features = featuresInsideYF(data.features, this.yfPolygon);
      
      const layer = L.geoJSON({ 
        type: 'FeatureCollection', 
        features 
      }, { style }).addTo(this.map);
      
      this.overlayLayers[key] = layer;
    }
  }
  
  async loadNodesLayer() {
    const nodesData = await loadGeoJSON('nodes.geojson');
    const nodesLayer = L.layerGroup();
    
    nodesData.features.forEach(feature => {
      const coords = turf.centroid(feature).geometry.coordinates;
      const marker = L.marker([coords[1], coords[0]], { 
        icon: nodeIcon 
      });
      
      marker.bindPopup(feature.properties.Name || "Unnamed");
      marker.addTo(nodesLayer);
    });
    
    nodesLayer.addTo(this.map);
    this.overlayLayers["Nodes"] = nodesLayer;
  }
  
  async loadPhotosLayer() {
    const photosData = await loadGeoJSON('pho.geojson');
    const photosLayer = L.layerGroup();
    
    photosData.features.forEach(feature => {
      const coords = turf.centroid(feature).geometry.coordinates;
      const direction = feature.properties.direction || 0;
      const photoUri = feature.properties.uri || "photos/default.jpg";

      const photoIcon = L.divIcon({
        className: 'photo-icon',
        html: `<img src="${ICONS_PATH}photo.svg" style="transform: rotate(${direction}deg);">`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
      });

      const marker = L.marker([coords[1], coords[0]], { icon: photoIcon });
      marker.bindPopup(`
        <div class="photo-popup">
          <img src="${photoUri}" alt="Site photo">
          <div class="photo-caption">${photoUri}</div>
        </div>
      `);
      
      marker.addTo(photosLayer);
    });

    photosLayer.addTo(this.map);
    this.overlayLayers["Photos"] = photosLayer;
  }
  
  async loadSportsLayer() {
    const cultSpoData = await loadGeoJSON('cult_spo.geojson');
    const sportsLayer = L.layerGroup();
    
    featuresInsideYF(cultSpoData.features, this.yfPolygon).forEach(feature => {
      const coords = turf.centroid(feature).geometry.coordinates;
      const marker = L.marker([coords[1], coords[0]], { 
        icon: sportsIcon 
      });
      
      marker.bindPopup(feature.properties.Name || "Unnamed");
      marker.addTo(sportsLayer);
    });

    sportsLayer.addTo(this.map);
    this.overlayLayers["Sports"] = sportsLayer;
  }
  
  async loadDetailedFeaturesLayer() {
    const detData = await loadGeoJSON('det.geojson');
    
    const detLayer = L.geoJSON(detData, {
      style: layerStyles.detLayer,
      onEachFeature: (feature, layer) => {
        // Add click event to open a PDF if available
        if (feature.properties?.url) {
          layer.on('click', () => {
            window.open(feature.properties.url, '_blank');
          });
        }

        // Add a tooltip if the feature has a name
        if (feature.properties?.name) {
          const bounds = layer.getBounds();
          const topCenter = [
            bounds.getNorth(), 
            (bounds.getWest() + bounds.getEast()) / 2
          ];
          
          const tooltip = L.tooltip({
            permanent: true,
            direction: 'center',
            className: 'polygon-label',
            offset: [0, -30]
          })
            .setLatLng(topCenter)
            .setContent(`<span class="feature-label">${feature.properties.name}</span>`);
            
          this.map.addLayer(tooltip);
        }
      }
    });

    detLayer.addTo(this.map);
    this.overlayLayers["Detailed Features"] = detLayer;
  }
  
  getOverlayLayers() {
    return this.overlayLayers;
  }
}

// Setup legend toggling
function setupLegendToggle() {
  const legendItems = document.querySelector('.legend-items');
  const legendHeader = document.querySelector('.legend-header');
  
  legendHeader.addEventListener('click', () => {
    if (legendItems.style.display === 'none' || !legendItems.style.display) {
      legendItems.style.display = 'block';
      legendHeader.innerHTML = '- Legend';
    } else {
      legendItems.style.display = 'none';
      legendHeader.innerHTML = '+ Legend';
    }
  });
  
  // Initially hide the legend items
  legendItems.style.display = 'none';
}

// Main initialization
async function initializeApplication() {
  try {
    // Initialize loading manager
    loadingManager.initialize();
    
    // Initialize map
    const { map, basemapLayers } = initializeMap();
    
    // Setup legend toggle
    setupLegendToggle();
    
    // Initialize layer loader
    const layerLoader = new LayerLoader(map);
    
    // Load layers
    await layerLoader.loadYFBoundary();
    await layerLoader.loadGeneralLayers();
    await layerLoader.loadNodesLayer();
    await layerLoader.loadPhotosLayer();
    await layerLoader.loadSportsLayer();
    await layerLoader.loadDetailedFeaturesLayer();
    
    // Add layer control
    L.control.layers(
      basemapLayers,
      layerLoader.getOverlayLayers(), 
      { position: 'bottomright' }
    ).addTo(map);
    
  } catch (error) {
    console.error('Map initialization failed:', error);
    // Make sure loading indicator is hidden even if there's an error
    loadingManager.hideLoader();
  }
}

// Start the application
document.addEventListener('DOMContentLoaded', initializeApplication);