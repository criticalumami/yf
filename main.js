// Global variables
let map;
let layerControl;
const layers = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupControls();
    loadData();
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
        color: '#A9A9A9',
        weight: 1,
        fillColor: '#D3D3D3',
        fillOpacity: 0.5,
        className: 'buildings-layer'
    },
    majorBuildings: {
        color: '#000',
        weight: 0.5,
        fillColor: '#3f3f3f',
        fillOpacity: 0.9,
        className: 'major-buildings-layer'
    },
    surveyLines: {
        color: '#000000',
        weight: 0.25,
        className: 'survey-lines-layer'
    },
    parks: {
        color: '#006400',
        weight: 1,
        fillColor: '#90EE90',
        fillOpacity: 0.5,
        className: 'parks-layer'
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
        weight: 3,
        fillColor: '#FFE4B5',
        fillOpacity: 0.6,
        className: 'detailed-zones-layer'
    }
};

// Icon definitions
const ICONS = {
    node: L.icon({
        iconUrl: 'icons/loz.svg',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10]
    }),
    sports: L.icon({
        iconUrl: 'icons/sports.svg',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10]
    }),
    photo: function(direction) {
        return L.divIcon({
            className: 'photo-icon',
            html: `<img src="icons/photo.svg" style="transform: rotate(${direction || 0}deg);">`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -12]
        });
    }
};

// Initialize map and base layers
function initMap() {
    map = L.map('map', { 
        attributionControl: false,
        zoomControl: true
    });

    // Define basemaps
    const baseMaps = {
        "Minimalist": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 19
        }),
        "OSM": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
    const mapTitle = L.control({position: 'topright'});
    mapTitle.onAdd = function() {
        const div = L.DomUtil.create('div', 'map-title');
        div.innerHTML = 'Yerevan Flyover - SIMA';
        return div;
    };
    mapTitle.addTo(map);

    // Add scale bar
    L.control.scale({
        maxWidth: 200,
        metric: true,
        imperial: false,
        position: 'bottomleft'
    }).addTo(map);

    // Add north arrow
    const northArrow = L.control({ position: 'bottomright' });
    northArrow.onAdd = function() {
        const div = L.DomUtil.create('div', 'north-arrow');
        div.innerHTML = '<img src="icons/north-arrow.svg" alt="North Arrow">';
        return div;
    };
    northArrow.addTo(map);
}

// Load all data layers
function loadData() {
    showLoading();
    
    loadBoundary()
        .then(() => {
            // Load other layers in parallel after boundary is loaded
            return Promise.all([
                loadLayer('buildings', 'data/bhbldg.geojson', STYLES.buildings, true),
                loadLayer('majorBuildings', 'data/maj_b.geojson', STYLES.majorBuildings, true),
                loadLayer('parks', 'data/parks.geojson', STYLES.parks, true),
                loadLayer('simaProjects', 'data/sima.geojson', STYLES.simaProjects, true),
                loadLayer('surveyLines', 'data/surv.geojson', STYLES.surveyLines, true),
                loadNodesLayer(),
                loadPhotosLayer(),
                loadSportsLayer(),
                loadDetailedZonesLayer()
            ]);
        })
        .catch(error => {
            console.error('Error loading map data:', error);
        })
        .finally(() => {
            hideLoading();
        });
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
    
    // Create and add the mask layer
    const maskLayer = L.polygon(maskCoords, {
        className: 'yf-mask',
        interactive: false
    }).addTo(map);
    
    layers.mask = maskLayer;
    
    return maskLayer;
}

// Generic function to load GeoJSON layer
function loadLayer(id, url, style, addToMap = false, filter = true) {
    return fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`Failed to load ${url}`);
            return response.json();
        })
        .then(data => {
            // Filter features within YF boundary if needed
            if (filter && layers.yfPolygon) {
                data.features = filterFeaturesInsideBoundary(data.features, layers.yfPolygon);
            }
            
            const layer = L.geoJSON(data, { style });
            
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

// Filter features inside YF boundary
function filterFeaturesInsideBoundary(features, boundary) {
    return features.filter(feature => 
        turf.booleanIntersects(turf.feature(feature.geometry), boundary)
    );
}

// Load nodes layer
function loadNodesLayer() {
    return fetch('data/nodes.geojson')
        .then(response => {
            if (!response.ok) throw new Error('Failed to load nodes');
            return response.json();
        })
        .then(data => {
            const nodesLayer = L.geoJSON(data, {
                pointToLayer: function(feature, latlng) {
                    const marker = L.marker(latlng, { 
                        icon: ICONS.node 
                    });
                    
                    marker.bindTooltip(feature.properties.Name || "Unnamed", {
                        permanent: false,
                        direction: 'top',
                        offset: [0, -10],
                        className: 'node-label'
                    });
                    
                    return marker;
                }
            });
            
            nodesLayer.addTo(map);
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
            const photosLayer = L.geoJSON(data, {
                pointToLayer: function (feature, latlng) {
                    const direction = feature.properties.direction || 0;
                    const photoUri = feature.properties.uri || "photos/default.jpg";
                    
                    const marker = L.marker(latlng, { 
                        icon: ICONS.photo(direction)
                    });
                    
                    marker.bindPopup(`
                        <div class="photo-popup">
                            <img src="${photoUri}" alt="Site photo">
                            <div class="photo-caption">${photoUri}</div>
                        </div>
                    `);
                    
                    return marker;
                }
            });
            
            photosLayer.addTo(map);
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
            // Filter features inside YF boundary
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
                            layer.setStyle({ fillOpacity: 0.05 });
                        });
                    }
                    
                    // Add a label if the feature has a name
                    if (feature.properties?.name) {
                        addZoneLabel(feature, layer);
                    }
                }
            });
            
            detLayer.addTo(map);
            layers.detailedZones = detLayer;
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
    const bounds = layer.getBounds();
    const center = bounds.getCenter();
    
    // Create a tooltip for the label
    const tooltip = L.tooltip({
        permanent: true,
        direction: 'center',
        className: 'polygon-label',
        offset: [0, 0]
    })
    .setLatLng(center)
    .setContent(`<span class="feature-label">${feature.properties.name}</span>`);
    
    // Add the tooltip to the map
    tooltip.addTo(map);
}

// Show/hide loading indicator
function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
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