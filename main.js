const map = L.map('map', { attributionControl: false });

// Base map setup
const basemap = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd',
  maxZoom: 19
});

// Satellite basemap (Esri World Imagery)
const satelliteBasemap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
    maxZoom: 19
  });
  
const overlayLayers = {};

// Icons
const nodeIcon = L.icon({
  iconUrl: 'icons/loz.svg', // Path to the loz.svg file
  iconSize: [20, 20], // Adjust the size of the icon
  iconAnchor: [10, 10], // Anchor the icon at its center
  popupAnchor: [0, -10] // Position the popup above the icon
});

const sportsIcon = L.icon({
  iconUrl: 'icons/sports.svg',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

// Add control layers and scale to map
// L.control.layers({ Basemap: basemap }, overlayLayers, { position: 'bottomright' }).addTo(map);
L.control.scale({ position: 'bottomright', imperial: false, metric: true }).addTo(map);

// North Arrow control
const northArrow = L.control({ position: 'bottomright' });
northArrow.onAdd = function () {
  const div = L.DomUtil.create('div', 'north-arrow');
  div.innerHTML = '<img src="icons/north-arrow.svg" alt="North Arrow" style="width: 40px; height: 40px;">';
  return div;
};
northArrow.addTo(map);

// Load GeoJSON data function
async function loadGeoJSON(path) {
  const res = await fetch(`data/${path}`);
  return res.json();
}

// Create mask from YF polygon
function createMaskFromPolygon(yfGeoJSON) {
    const outer = [
      [[-180, -90], [-180, 90], [180, 90], [180, -90], [-180, -90]]
    ];
    const maskCoords = outer.concat(yfGeoJSON.features[0].geometry.coordinates.map(ring => ring.map(c => [c[0], c[1]])));
  
    return L.geoJSON({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: maskCoords
        }
      }, {
        className: 'yf-mask',
        interactive: false
      });
  }


// Check if any part of the geometry is inside YF polygon
function isGeometryInsideYF(feature, yfPolygon) {
  return turf.booleanIntersects(turf.feature(feature.geometry), yfPolygon);
}

// Load and display layers
async function loadMain() {
  try {
    // Load YF boundary and create the layer
    const yfData = await loadGeoJSON('YF.geojson');
    const yfPolygon = turf.feature(yfData.features[0].geometry);

    const yfLayer = L.geoJSON(yfData, {
      style: { color: '#000', weight: 2, fillColor: '#FFF', fillOpacity: 0.2 }
    }).addTo(map);
    overlayLayers["YF Boundary"] = yfLayer;
    map.fitBounds(yfLayer.getBounds());

    // Layer definitions
    const layerDefs = [
      {
        key: 'Buildings',
        file: 'bhbldg.geojson',
        filter: f => isGeometryInsideYF(f, yfPolygon),
        style: { color: '#A9A9A9', weight: 1, fillColor: '#D3D3D3', fillOpacity: 0.5 }
      },
      {
        key: 'Major Buildings',
        file: 'maj_b.geojson',
        filter: f => isGeometryInsideYF(f, yfPolygon),
        style: { color: '#000', weight: 0.5, fillColor: '#3f3f3f', fillOpacity: 0.9 }
      },
      {
        key: 'Parks',
        file: 'parks.geojson',
        filter: f => isGeometryInsideYF(f, yfPolygon),
        style: { color: '#006400', weight: 1, fillColor: '#90EE90', fillOpacity: 0.5 }
      },
      {
        key: 'SIMA Projects',
        file: 'sima.geojson',
        filter: f => isGeometryInsideYF(f, yfPolygon),
        style: { color: '#00bfff', weight: 2, fillColor: '#FFFFFF', fillOpacity: 0 }
      },
      {
        key: 'Survey',
        file: 'surv.geojson',
        filter: f => isGeometryInsideYF(f, yfPolygon),
        style: { color: '#000000', weight: 0.25 }
      }
    ];

    // Load and add layers to the map
    for (let def of layerDefs) {
      const data = await loadGeoJSON(def.file);
      const features = def.filter ? data.features.filter(def.filter) : data.features;
      const layer = L.geoJSON({ type: 'FeatureCollection', features }, { style: def.style }).addTo(map);
      overlayLayers[def.key] = layer;
    }

    // Add nodes layer
    const nodesData = await loadGeoJSON('nodes.geojson');
    const nodesLayer = L.layerGroup();
    nodesData.features
      .filter(f => isGeometryInsideYF(f, yfPolygon))
      .forEach(feature => {
        const coords = turf.centroid(feature).geometry.coordinates;
        const marker = L.marker([coords[1], coords[0]], { icon: nodeIcon }).addTo(nodesLayer);
        marker.bindPopup(feature.properties.Name || "Unnamed");
      });
    nodesLayer.addTo(map);
    overlayLayers["Nodes"] = nodesLayer;

    // Add photos layer
    const phoData = await loadGeoJSON('pho.geojson');
    const phoLayer = L.layerGroup();
    phoData.features.forEach(feature => {
      const coords = turf.centroid(feature).geometry.coordinates;
      const direction = feature.properties.direction || 0;
      const photoUri = feature.properties.uri || "photos/default.jpg";

      const photoIcon = L.divIcon({
        className: 'photo-icon',
        html: `<img src="icons/photo.svg" style="width: 24px; height: 24px; transform: rotate(${direction}deg);">`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
      });

      const marker = L.marker([coords[1], coords[0]], { icon: photoIcon }).addTo(phoLayer);
      marker.bindPopup(`<div style="text-align: center;"><img src="${photoUri}" style="width: 300px; height: auto; margin-bottom: 8px;"><br><strong>${photoUri}</strong></div>`);
    });

    phoLayer.addTo(map);
    overlayLayers["Photos"] = phoLayer;

    // Add sports layer
    const cultSpoData = await loadGeoJSON('cult_spo.geojson');
    const sportsLayer = L.layerGroup();
    cultSpoData.features
      .filter(f => isGeometryInsideYF(f, yfPolygon)) // Apply filtering for inside YF polygon
      .forEach(feature => {
        const coords = turf.centroid(feature).geometry.coordinates;
        const marker = L.marker([coords[1], coords[0]], { icon: sportsIcon }).addTo(sportsLayer);
        marker.bindPopup(feature.properties.Name || "Unnamed");
      });

    sportsLayer.addTo(map);
    overlayLayers["Sports"] = sportsLayer;

    // White background layer
    const whiteBackground = L.tileLayer('', { 
      noWrap: true, 
      minZoom: 0, 
      maxZoom: 19,
      attribution: ''
    });

    const yfMask = createMaskFromPolygon(yfData);
    map.addLayer(yfMask);

    // Add det.geojson on top of everything else
    const detData = await loadGeoJSON('det.geojson');
    
    const detLayer = L.geoJSON(detData, {
      style: { color: '#FF4500', weight: 3, fillColor: '#FFA07A', fillOpacity: 0.05 }, // Customize the style
      onEachFeature: (feature, layer) => {
        if (feature.properties && feature.properties.url) {
          layer.on('click', () => {
            const pdfPath = `${feature.properties.url}`; // Prepend the pdf folder path
            window.open(pdfPath, '_blank'); // Open the PDF in a new tab
          });
        }
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
    }).addTo(map);

    // Add to overlay layers for toggling
    overlayLayers["Detailed Features"] = detLayer;

    // Update control layers with all overlay layers and toggle the basemap
    L.control.layers({
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

// Toggle function for the legend
function toggleLegend() {
  const legendItems = document.querySelector('.legend-items');
  const legendHeader = document.querySelector('.legend-header');
  
  // Toggle the display of the legend items
  if (legendItems.style.display === 'none') {
    legendItems.style.display = 'block';
    legendHeader.innerHTML = '- Legend'; // Change text to show it is expanded
  } else {
    legendItems.style.display = 'none';
    legendHeader.innerHTML = '+ Legend'; // Change text to show it is collapsed
  }
}