// track GeoJSON maps loading status
window.firstMapInitialize = false;
window.secondMapInitialize= false;
let mapPresent;
let selectedPolygons = []; // to store selected/clicked polygons
let lastOp = null; // track the last operation (intersect/union)
let currentView = 'view1'; // to set  display map

// store the result polygons (result of operations) and invisible polygons for each solution
let resultPolygon1 = null;
let hiddenPolygons1 = [];
let resultPolygon2 = null;
let hiddenPolygons2 = [];

// for storing map shape 
// In-memory GeoJSON 
let modifiedGeoJSON1 = null;
let modifiedGeoJSON2 = null;

const originalGeoJSON1Url = 'SE_State_Management_Polygons_1.json'; // Original GeoJSON file for solution 1
const originalGeoJSON2Url = 'SE_State_Management_Polygons_2.json'; // Original GeoJSON file for solution 2

// define colors for selected and unselected states
const selectedColor = 'yellow';
const defaultColor = '#3388ff';

// // Load the initial map (Solution 1) on page load (if it is needed)
// window.onload = function () {
//     document.getElementById('view1').classList.add('active');
//     loadGeoJSONMapData(originalGeoJSON1Url);
//     window.firstMapInitialize = true;
// };

// event listeners for solution buttons
document.getElementById('view1').addEventListener('click', function () {
    currentView = 'view1';
    document.getElementById('view1').classList.add('active');
    document.getElementById('view2').classList.remove('active');
    reloadCurrentSolution();
});

document.getElementById('view2').addEventListener('click', function () {
    currentView = 'view2';
    document.getElementById('view2').classList.add('active');
    document.getElementById('view1').classList.remove('active');
    reloadCurrentSolution();
});

// reload the present solution's modified or original GeoJSON data
function reloadCurrentSolution() {
    selectedPolygons = [];
    lastOperation = null;

    if (currentView === 'view1') {
        if (modifiedGeoJSON1) {
            loadGeoJSONMapData(null, modifiedGeoJSON1);
        } else {
            loadGeoJSONMapData(originalGeoJSON1Url);
        }
    } else if (currentView === 'view2') {
        if (modifiedGeoJSON2) {
            loadGeoJSONMapData(null, modifiedGeoJSON2);
        } else {
            loadGeoJSONMapData(originalGeoJSON2Url);
        }
    }
}

// button event listeners
document.getElementById('intersectBtn').addEventListener('click', function () {
    if (selectedPolygons.length === 2) {
        calculateIntersection(selectedPolygons);
        lastOperation = 'intersect';
    }
});

document.getElementById('unionBtn').addEventListener('click', function () {
    if (selectedPolygons.length === 2) {
        calculateUnion(selectedPolygons);
        lastOperation = 'union';
    }
});

document.getElementById('resetBtn').addEventListener('click', function () {
    resetMap();
});

// reset the map to its initial state, retaining the current solution
function resetMap() {
    selectedPolygons = [];
    lastOperation = null;

    if (currentView === 'view1') {
        modifiedGeoJSON1 = null; // Clear modified GeoJSON
        loadGeoJSONMapData(originalGeoJSON1Url);
    } else {
        modifiedGeoJSON2 = null; // Clear modified GeoJSON
        loadGeoJSONMapData(originalGeoJSON2Url);
    }

    document.getElementById('result').textContent = "Map reset to its initial state.";
    document.getElementById('statistics').textContent = "No polygons selected.";
}

// load GeoJSON data for a map
function loadGeoJSONMapData(geojsonUrl = null, geojsonData = null) {
    if (geojsonUrl) {
        fetch(geojsonUrl)
            .then(response => response.json())
            .then(data => initMap(data))
            .catch(error => console.error('Error loading GeoJSON:', error));
    } else if (geojsonData) {
        initMap(geojsonData);
    }
}

// initialize the map
function initMap(mapData) {
    if (mapPresent) {
        mapPresent.remove();
        mapPresent = null;
    }

    mapPresent = L.map('map').setView([48.85825679985474, 2.293885230445862], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapPresent);

    L.geoJSON(mapData, {
        onEachFeature: function (feature, layer) {
            layer.on('click', function () {
                handlePolygonClick(layer, feature);
            });
        }
    }).addTo(mapPresent);
}

// handle polygon click events
function handlePolygonClick(layer, feature) {
    const isSelected = selectedPolygons.includes(layer);

    if (isSelected) {
        selectedPolygons = selectedPolygons.filter(polygon => polygon !== layer);
        layer.setStyle({ color: defaultColor });
    } else {
        selectedPolygons.push(layer);
        layer.setStyle({ color: selectedColor });
    }

    calculateTotalArea();
}

// calculate the total area of selected polygons and display it in the statistics column
function calculateTotalArea() {
    let totalArea = 0;

    selectedPolygons.forEach(polygon => {
        const jstsPolygon = convertLeafletPolygonToJSTS(polygon);
        const projectedPolygon = projectPolygonToMeters(jstsPolygon);
        totalArea += projectedPolygon.getArea();
    });

    const areaText = totalArea > 0 ? `Total area: ${totalArea.toFixed(2)} square meters` : 'No polygons selected';
    document.getElementById('statistics').textContent = areaText;
}

// poject the polygon to Web Mercator (EPSG:3857) so that area is in meters
function projectPolygonToMeters(jstsPolygon) {
    const geometryFactory = new jsts.geom.GeometryFactory();
    const coords = jstsPolygon.getCoordinates();

    const projectedCoords = coords.map(coord => {
        const point = L.latLng(coord.y, coord.x);
        const projected = L.CRS.EPSG3857.project(point);
        return new jsts.geom.Coordinate(projected.x, projected.y);
    });

    const linearRing = geometryFactory.createLinearRing(projectedCoords);
    return geometryFactory.createPolygon(linearRing);
}

// clculate intersection using JSTS and store the new GeoJSON data
function calculateIntersection(selectedPolygons) {
    try {
        const jstsPolygon1 = convertLeafletPolygonToJSTS(selectedPolygons[0]);
        const jstsPolygon2 = convertLeafletPolygonToJSTS(selectedPolygons[1]);

        const intersection = jstsPolygon1.intersection(jstsPolygon2);

        if (intersection.isEmpty()) {
            updateResult("No intersection found.");
            return;
        }

        const geojsonWriter = new jsts.io.GeoJSONWriter();
        const intersectionGeoJSON = geojsonWriter.write(intersection);

        let intersectionResult = L.geoJSON(intersectionGeoJSON, {
            style: { color: 'green' }
        }).bindPopup("Intersection");

        intersectionResult.addTo(mapPresent);

        if (currentView === 'view1') {
            modifiedGeoJSON1 = updateGeoJSON(modifiedGeoJSON1, intersectionGeoJSON);
        } else {
            modifiedGeoJSON2 = updateGeoJSON(modifiedGeoJSON2, intersectionGeoJSON);
        }

        updateResult("Intersection result found!");
    } catch (error) {
        updateResult("Error calculating intersection.");
        console.error("Error calculating intersection.", error);
    }
}

// calculate union using JSTS and store the new GeoJSON data
function calculateUnion(selectedPolygons) {
    try {
        const jstsPolygon1 = convertLeafletPolygonToJSTS(selectedPolygons[0]);
        const jstsPolygon2 = convertLeafletPolygonToJSTS(selectedPolygons[1]);

        const union = jstsPolygon1.union(jstsPolygon2);

        const geojsonWriter = new jsts.io.GeoJSONWriter();
        const unionGeoJSON = geojsonWriter.write(union);

        let unionResult = L.geoJSON(unionGeoJSON, {
            style: { color: 'green' }
        }).bindPopup("Union");

        unionResult.addTo(mapPresent);

        if (currentView === 'view1') {
            modifiedGeoJSON1 = updateGeoJSON(modifiedGeoJSON1, unionGeoJSON);
        } else {
            modifiedGeoJSON2 = updateGeoJSON(modifiedGeoJSON2, unionGeoJSON);
        }

        updateResult("Union result found!");
    } catch (error) {
        updateResult("Error calculating union.");
        console.error("Error calculating union.", error);
    }
}

// update the existing GeoJSON data with the new result
function updateGeoJSON(existingGeoJSON, newPolygonGeoJSON) {
    if (!existingGeoJSON) {
        return newPolygonGeoJSON;
    }

    existingGeoJSON.features.push(newPolygonGeoJSON.features[0]);
    return existingGeoJSON;
}

// update result message
function updateResult(message) {
    document.getElementById('result').textContent = message;
}

// convert Leaflet polygon to JSTS geometry
function convertLeafletPolygonToJSTS(leafletPolygon) {
    let latlngs = leafletPolygon.getLatLngs()[0];
    latlngs = ensureClosedLinearRing(latlngs.map(ll => [ll.lng, ll.lat]));
    const coordinates = latlngs.map(point => new jsts.geom.Coordinate(point[0], point[1]));

    const geometryFactory = new jsts.geom.GeometryFactory();
    const linearRing = geometryFactory.createLinearRing(coordinates);
    return geometryFactory.createPolygon(linearRing);
}

// ensure the polygon forms a closed LinearRing
function ensureClosedLinearRing(coordinates) {
    const firstPoint = coordinates[0];
    const lastPoint = coordinates[coordinates.length - 1];

    if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
        coordinates.push(firstPoint);
    }

    return coordinates;
}
