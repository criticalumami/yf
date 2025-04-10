const map = L.map('map', { attributionControl: false });

// Base map setup
const basemap = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd',
  maxZoom: 19
});

const satelliteBasemap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
  maxZoom: 19
});

// Define the OSM basemap
const osmBasemap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
});

const overlayLayers = {};

// Layer styles
const layerStyles = {
  yfBoundary: { color: '#000', weight: 2, fillColor: '#FFF', fillOpacity: 0.0  },
  buildings: { color: '#A9A9A9', weight: 1, fillColor: '#D3D3D3', fillOpacity: 0.5 },
  majorBuildings: { color: '#000', weight: 0.5, fillColor: '#3f3f3f', fillOpacity: 0.9 },
  parks: { color: '#006400', weight: 1, fillColor: '#90EE90', fillOpacity: 0.5 },
  simaProjects: { color: '#00bfff', weight: 2, fillColor: '#FFFFFF', fillOpacity: 0 },
  survey: { color: '#000000', weight: 0.25 },
  detLayer: { color: '#FF4500', weight: 3, fillColor: '#FFA07A', fillOpacity: 0.05 }
};

// Icons
const ICONS_PATH = 'icons/';
const nodeIcon = L.icon({ iconUrl: `${ICONS_PATH}loz.svg`, iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10] });
const sportsIcon = L.icon({ iconUrl: `${ICONS_PATH}sports.svg`, iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10] });

// Add control layers and scale to map
L.control.scale({ position: 'bottomright', imperial: false, metric: true }).addTo(map);

// North Arrow control
const northArrow = L.control({ position: 'bottomright' });
northArrow.onAdd = function () {
  const div = L.DomUtil.create('div', 'north-arrow');
  div.innerHTML = '<img src="icons/north-arrow.svg" alt="North Arrow" style="width: 40px; height: 40px;">';
  return div;
};
northArrow.addTo(map);

// Utility functions
async function loadGeoJSON(path) {
  try {
    const res = await fetch(`data/${path}`);
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return await res.json();
  } catch (err) {
    console.error(err);
    return { type: 'FeatureCollection', features: [] };
  }
}

function featuresInsideYF(features) {
  return features.filter(f => turf.booleanIntersects(turf.feature(f.geometry), window.yfPolygon));
}

function createMaskFromPolygon(yfGeoJSON) {
  const outer = [[[ -180, -90 ], [ -180, 90 ], [ 180, 90 ], [ 180, -90 ], [ -180, -90 ]]];
  const maskCoords = outer.concat(yfGeoJSON.features[0].geometry.coordinates.map(ring => ring.map(c => [c[0], c[1]])));

  return L.geoJSON({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: maskCoords }
  }, {
    className: 'yf-mask',
    interactive: false // Ensure the mask does not block interactions
  });
}

// Layer loading functions
async function loadYFBoundary() {
  const yfData = await loadGeoJSON('YF.geojson');
  window.yfPolygon = turf.feature(yfData.features[0].geometry);

  const yfLayer = L.geoJSON(yfData, { style: layerStyles.yfBoundary }).addTo(map);
  overlayLayers["YF Boundary"] = yfLayer;
  map.fitBounds(yfLayer.getBounds());
}

async function loadGeneralLayers() {
  const layersConfig = [
    { key: 'Buildings', file: 'bhbldg.geojson', style: layerStyles.buildings },
    { key: 'Major Buildings', file: 'maj_b.geojson', style: layerStyles.majorBuildings },
    { key: 'Parks', file: 'parks.geojson', style: layerStyles.parks },
    { key: 'SIMA Projects', file: 'sima.geojson', style: layerStyles.simaProjects },
    { key: 'Survey', file: 'surv.geojson', style: layerStyles.survey }
  ];

  for (const { key, file, style } of layersConfig) {
    const data = await loadGeoJSON(file);
    const features = featuresInsideYF(data.features);
    const layer = L.geoJSON({ type: 'FeatureCollection', features }, { style }).addTo(map);
    overlayLayers[key] = layer;
  }
}

async function loadNodesLayer() {
  const nodesData = await loadGeoJSON('nodes.geojson');
  const nodesLayer = L.layerGroup();
  nodesData.features.forEach(feature => {
    const coords = turf.centroid(feature).geometry.coordinates;
    const marker = L.marker([coords[1], coords[0]], { icon: nodeIcon }).addTo(nodesLayer);
    marker.bindPopup(feature.properties.Name || "Unnamed");
  });
  nodesLayer.addTo(map);
  overlayLayers["Nodes"] = nodesLayer;
}

async function loadPhotosLayer() {
  const phoData = await loadGeoJSON('pho.geojson');
  const phoLayer = L.layerGroup();
  phoData.features.forEach(feature => {
    const coords = turf.centroid(feature).geometry.coordinates;
    const direction = feature.properties.direction || 0;
    const photoUri = feature.properties.uri || "photos/default.jpg";

    const photoIcon = L.divIcon({
      className: 'photo-icon',
      html: `<img src="${ICONS_PATH}photo.svg" style="width: 24px; height: 24px; transform: rotate(${direction}deg);">`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    });

    const marker = L.marker([coords[1], coords[0]], { icon: photoIcon }).addTo(phoLayer);
    marker.bindPopup(`<div style="text-align: center;"><img src="${photoUri}" style="width: 300px; height: auto; margin-bottom: 8px;"><br><strong>${photoUri}</strong></div>`);
  });

  phoLayer.addTo(map);
  overlayLayers["Photos"] = phoLayer;
}

async function loadSportsLayer() {
  const cultSpoData = await loadGeoJSON('cult_spo.geojson');
  const sportsLayer = L.layerGroup();
  featuresInsideYF(cultSpoData.features).forEach(feature => {
    const coords = turf.centroid(feature).geometry.coordinates;
    const marker = L.marker([coords[1], coords[0]], { icon: sportsIcon }).addTo(sportsLayer);
    marker.bindPopup(feature.properties.Name || "Unnamed");
  });

  sportsLayer.addTo(map);
  overlayLayers["Sports"] = sportsLayer;
}

async function loadDetailedFeaturesLayer() {
  const detData = await loadGeoJSON('det.geojson');
  const detLayer = L.geoJSON(detData, {
    style: layerStyles.detLayer,
    onEachFeature: (feature, layer) => {
      // Add click event to open a PDF if the feature has a URL property
      if (feature.properties && feature.properties.url) {
        layer.on('click', () => {
          const pdfPath = `${feature.properties.url}`;
          window.open(pdfPath, '_blank');
        });
      }

      // Add a tooltip if the feature has a name property
      if (feature.properties && feature.properties.name) {
        const bounds = layer.getBounds();
        const topCenter = [bounds.getNorth(), (bounds.getWest() + bounds.getEast()) / 2];
        const tooltip = L.tooltip({
          permanent: true,
          direction: 'center',
          className: 'polygon-label',
          offset: [0, -30]
        })
          .setLatLng(topCenter)
          .setContent(`<span style="color: #FF4500; background-color: #FFFFFF">${feature.properties.name}</span>`);
        map.addLayer(tooltip);
      }
    }
  });

  // Add the det layer to the map last to ensure it is on top
  detLayer.addTo(map);
  overlayLayers["Detailed Features"] = detLayer;
}

// Main initialization
async function loadMain() {
  try {
    await loadYFBoundary();
    await loadGeneralLayers();
    await loadNodesLayer();
    await loadPhotosLayer();
    await loadSportsLayer();

    const whiteBackground = L.tileLayer('', { noWrap: true, minZoom: 0, maxZoom: 19, attribution: '' });
    const yfData = await loadGeoJSON('YF.geojson');
    const yfMask = createMaskFromPolygon(yfData);
    map.addLayer(yfMask); // Add the mask before other layers

    await loadDetailedFeaturesLayer(); // Add the det layer last to ensure it is on top

    // Add layer control with basemaps and boundaries
    L.control.layers({
      "OSM": osmBasemap,
      "Basemap": basemap,
      "Satellite": satelliteBasemap,
      "White Background": whiteBackground
    }, overlayLayers, { position: 'bottomright' }).addTo(map);

    const legendItems = document.querySelector('.legend-items');
    const legendHeader = document.querySelector('.legend-header');
    if (legendItems && legendHeader) {
      legendItems.style.display = 'none';
      legendHeader.innerHTML = '+ Legend';
    }
  } catch (err) {
    console.error('Map loading failed:', err);
  }
}

loadMain();

// Toggle legend visibility
function toggleLegend() {
  const legendItems = document.querySelector('.legend-items');
  const legendHeader = document.querySelector('.legend-header');
  if (legendItems.style.display === 'none') {
    legendItems.style.display = 'block';
    legendHeader.innerHTML = '- Legend';
  } else {
    legendItems.style.display = 'none';
    legendHeader.innerHTML = '+ Legend';
  }
}