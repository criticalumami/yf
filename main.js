// Global variables
let map;
let layerControl, mapTitle, scaleBar, northArrow;
const layers = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupControls();
    loadData();

    const overlay = document.getElementById('overlay');
    overlay.addEventListener('click', () => {
        overlay.style.display = 'none';
        map.scrollWheelZoom.enable();
    });
});

// Map style constants
const STYLES = {
    mask: {
        color: 'white',
        fillColor: 'white',
        fillOpacity: 0.7,
        stroke: false,
        interactive: false
    },
    boundary: {
        color: 'black',
        weight: 2,
        fill: false,
        fillOpacity: 0
    },
    buildings: {
        className: 'buildings-layer'
    },
    majorBuildings: {
        className: 'major-buildings-layer'
    },
    surveyLines: {
        color: '#cccccc',
        weight: 1
    },
    parks: {
        color: 'darkgreen',
        fillColor: 'lightgreen',
        fillOpacity: 0.5,
        weight: 1
    },
    simaProjects: {
        color: '#00bfff',
        weight: 2,
        fillColor: '#FFFFFF',
        fillOpacity: 0,
        className: 'sima-projects-layer'
    },
    detailedZones: {
        color: '#FFA500',
        weight: 2,
        fillColor: '#FFE4B5',
        fillOpacity: 0.6,
        className: 'detailed-zones-layer'
    }
};

// Icon definitions
const ICONS = {
    node: L.icon({
        iconUrl: 'icons/loz.svg',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    }),
    sports: L.icon({
        iconUrl: 'icons/sports.svg',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    }),
    photo: L.icon({
        iconUrl: 'icons/photo.svg',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    })
};

// Initialize map and base layers
function initMap() {
    map = L.map('map', { 
        attributionControl: false,
        zoomControl: true,
        scrollWheelZoom: false  // Disable scroll wheel zoom by default
    });

    // Define basemaps
    const baseMaps = {
        "Minimalist": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 19
        }),
        "Satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        }),
        "White": L.tileLayer('', {
            maxZoom: 19
        })
    };
    
    // Add default basemap
    baseMaps["Minimalist"].addTo(map);
    
    // Create layer control
    layerControl = L.control.layers(baseMaps, {}, { position: 'bottomright' }).addTo(map);
}

// Set up map controls (title, scale, north arrow)
function setupControls() {
    // Add map title
    mapTitle = L.control({position: 'topright'});
    mapTitle.onAdd = function() {
        const div = L.DomUtil.create('div', 'map-title');
        div.innerHTML = 'Yerevan Flyover - SIMA';
        return div;
    };
    mapTitle.addTo(map);

    // Add scale bar
    scaleBar = L.control.scale({
        maxWidth: 200,
        metric: true,
        imperial: false,
        position: 'bottomleft'
    }).addTo(map);

    // Add north arrow
    northArrow = L.control({ position: 'bottomright' });
    northArrow.onAdd = function() {
        const div = L.DomUtil.create('div', 'north-arrow');
        div.innerHTML = '<img src="icons/north-arrow.svg" alt="North Arrow">';
        return div;
    };
    northArrow.addTo(map);
}

// Load all data layers
function loadData() {
    loadBoundary()
        .then(() => {
            // Load other layers in parallel after boundary is loaded
            return Promise.all([
                loadLayer('buildings', 'data/bhbldg.geojson', STYLES.buildings, true),
                loadLayer('majorBuildings', 'data/maj_b.geojson', STYLES.majorBuildings, true),
                loadLayer('parks', 'data/parks.geojson', STYLES.parks, true),
                loadLayer('simaProjects', 'data/sima.geojson', STYLES.simaProjects, true),
                loadLayer('surveyLines', 'data/surv.geojson', STYLES.surveyLines, true),
                loadSportsLayer(),
                loadDetailedZonesLayer()
            ]);
        })
        .catch(error => {
            console.error('Error loading map data:', error);
        })
}


// Load YF boundary and create mask
function loadBoundary() {
    return fetch('data/YF.geojson')
        .then(response => {
            if (!response.ok) throw new Error('Failed to load YF boundary');
            return response.json();
        })
        .then(data => {
            const feature = data.features[0];
            
            if (feature.geometry.type === 'Polygon') {
                // Create mask and boundary
                createBoundaryMask(feature);
                
                // Add the boundary line separately
                const boundaryLayer = L.geoJSON(feature, {
                    style: STYLES.boundary
                }).addTo(map);
                
                // Store reference and fit map to boundary
                layers.boundary = boundaryLayer;
                map.fitBounds(boundaryLayer.getBounds());
                
                // Store polygon for filtering other layers
                layers.yfPolygon = turf.feature(feature.geometry);
                
                return boundaryLayer;
            }
            throw new Error('Invalid boundary geometry');
        });
}

// Create mask outside boundary
function createBoundaryMask(feature) {
    // Define coordinates for the world bounds
    const outerBounds = [
        [-90, -180],
        [-90, 180],
        [90, 180],
        [90, -180],
        [-90, -180]
    ];
    
    // Get the coordinates for the inner hole (YF boundary)
    const innerHole = feature.geometry.coordinates[0].map(coord => [coord[1], coord[0]]); // Swap lon/lat for Leaflet
    
    // Combine outer bounds and inner hole for the mask polygon
    const maskCoords = [outerBounds, innerHole];
    
    // Create and add the mask layer with increased opacity
    const maskLayer = L.polygon(maskCoords, {
        fillColor: 'white',
        fillOpacity: 0.7,
        stroke: false,
        interactive: false,
        className: 'mask-layer'
    }).addTo(map);
    
    layers.mask = maskLayer;
    
    return maskLayer;
}

// Filter features inside YF boundary
function filterFeaturesInsideBoundary(features, boundary) {
    return features.filter(feature => 
        turf.booleanIntersects(turf.feature(feature.geometry), boundary)
    );
}

// Generic function to load GeoJSON layer
function loadLayer(id, url, options, addToMap = false) {
    return fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`Failed to load ${url}`);
            return response.json();
        })
        .then(data => {
            // Filter features within YF boundary
            if (layers.yfPolygon) {
                data.features = filterFeaturesInsideBoundary(data.features, layers.yfPolygon);
            }
            
            const layer = L.geoJSON(data, options);
            
            if (addToMap) {
                layer.addTo(map);
            }
            
            layers[id] = layer;
            layerControl.addOverlay(layer, toTitleCase(id));
            
            return layer;
        })
        .catch(error => {
            console.error(`Error loading ${id}:`, error);
            return null;
        });
}

// Load nodes layer
function loadNodesLayer() {
    return fetch('data/nodes.geojson')
        .then(response => {
            if (!response.ok) throw new Error('Failed to load nodes');
            return response.json();
        })
        .then(data => {
            // Filter features within YF boundary
            if (layers.yfPolygon) {
                data.features = filterFeaturesInsideBoundary(data.features, layers.yfPolygon);
            }
            
            const nodesLayer = L.geoJSON(data, {
                pointToLayer: function(feature, latlng) {
                    const marker = L.marker(latlng, { 
                        icon: ICONS.node 
                    });
                    
                    marker.bindTooltip(feature.properties.Name || "Unnamed", {
                        permanent: false,
                        direction: 'top',
                        offset: [0, -12],
                        className: 'node-label'
                    });
                    
                    return marker;
                }
            });
            
            layers.nodes = nodesLayer;
            layerControl.addOverlay(nodesLayer, 'Nodes');
            
            return nodesLayer;
        })
        .catch(error => {
            console.error('Error loading nodes:', error);
            return null;
        });
}

// Load photos layer
function loadPhotosLayer() {
    return fetch('data/pho.geojson')
        .then(response => {
            if (!response.ok) throw new Error('Failed to load photos');
            return response.json();
        })
        .then(data => {
            // Filter features within YF boundary
            if (layers.yfPolygon) {
                data.features = filterFeaturesInsideBoundary(data.features, layers.yfPolygon);
            }
            
            const photosLayer = L.geoJSON(data, {
                pointToLayer: function (feature, latlng) {
                    const photoUri = feature.properties.uri || "photos/default.jpg";
                    
                    const marker = L.marker(latlng, { 
                        icon: ICONS.photo
                    });
                    
                    marker.bindPopup(`
                        <div class="photo-popup">
                            <img src="${photoUri}" alt="Site photo">
                        </div>
                    `);
                    
                    return marker;
                }
            });
            
            layers.photos = photosLayer;
            layerControl.addOverlay(photosLayer, 'Photos');
            
            return photosLayer;
        })
        .catch(error => {
            console.error('Error loading photos:', error);
            return null;
        });
}

// Load sports layer
function loadSportsLayer() {
    return fetch('data/cult_spo.geojson')
        .then(response => {
            if (!response.ok) throw new Error('Failed to load sports locations');
            return response.json();
        })
        .then(data => {
            // Filter features within YF boundary
            if (layers.yfPolygon) {
                data.features = filterFeaturesInsideBoundary(data.features, layers.yfPolygon);
            }
            
            const sportsLayer = L.geoJSON(data, {
                pointToLayer: function (feature, latlng) {
                    const marker = L.marker(latlng, { 
                        icon: ICONS.sports 
                    });
                    
                    marker.bindPopup(feature.properties.Name || "Unnamed Sports Facility");
                    
                    return marker;
                }
            });
            
            sportsLayer.addTo(map);
            layers.sports = sportsLayer;
            layerControl.addOverlay(sportsLayer, 'Sports Facilities');
            
            return sportsLayer;
        })
        .catch(error => {
            console.error('Error loading sports locations:', error);
            return null;
        });
}

// Load detailed zones layer
function loadDetailedZonesLayer() {
    return fetch('data/det.geojson')
        .then(response => {
            if (!response.ok) throw new Error('Failed to load detailed zones');
            return response.json();
        })
        .then(data => {
            // Filter features within YF boundary
            if (layers.yfPolygon) {
                data.features = filterFeaturesInsideBoundary(data.features, layers.yfPolygon);
            }
            
            const detLayer = L.geoJSON(data, {
                style: STYLES.detailedZones,
                onEachFeature: function(feature, layer) {
                    // Add click event to open a PDF if available
                    if (feature.properties?.url) {
                        layer.on('click', () => {
                            window.open(`${feature.properties.url}`, '_blank');
                        });
                        
                        layer.on('mouseover', function() {
                            layer.setStyle({ fillOpacity: 0.2 });
                            layer._path.style.cursor = 'pointer';
                        });
                        
                        layer.on('mouseout', function() {
                            layer.setStyle({ fillOpacity: 0.6 });
                        });
                    }
                    
                    // Add a label if the feature has a name
                    if (feature.properties?.name) {
                        layer.bindTooltip(addZoneLabel(feature, layer), {permanent: true});
                    }
                }
            });
            
            // Remove and re-add layers to ensure det layer is on top
            if (layers.photos) map.removeLayer(layers.photos);
            if (layers.nodes) map.removeLayer(layers.nodes);
            detLayer.addTo(map).bringToFront();
            layers.detailedZones = detLayer;
            if (layers.photos) layers.photos.addTo(map);
            if (layers.nodes) layers.nodes.addTo(map);
            
            layerControl.addOverlay(detLayer, 'Detailed Zones');
            
            return detLayer;
        })
        .catch(error => {
            console.error('Error loading detailed zones:', error);
            return null;
        });
}

// Add label for detailed zone
function addZoneLabel(feature, layer) {
    const center = layer.getBounds().getCenter();

    const tooltip = L.tooltip({
        permanent: true,
        direction: 'center',
        className: 'polygon-label',
        offset: [0, 0]
    })
    .setLatLng(center)
    .setContent(`<span class="feature-label">${feature.properties.name}</span>`);

    return tooltip;
}

// Helper function to convert string to title case
function toTitleCase(str) {
    return str.replace(/([A-Z])/g, ' $1')
        .replace(/^./, function(str) { return str.toUpperCase(); })
        .replace(/([A-Z])/g, function(match, p1) {
            return ' ' + p1;
        })
        .trim();
}
