// --- Global Variables ---
let roadsData = null;
let sapasData = null;
let roadTree = null;
let currentPosition = null;
let previousPosition = null;

let isDemoModeActive = false;
let demoIntervalId = null;
let currentDemoPointIndex = 0;
let demoRouteData = null;

// --- DOM Elements ---
const btnStart = document.getElementById('btnStart');
const btnDemo = document.getElementById('btnDemo'); // Added
const latlonDisplay = document.getElementById('latlon');
const speedDisplay = document.getElementById('speed');
const bearingDisplay = document.getElementById('bearing');
const roadDisplay = document.getElementById('road');
const dirDisplay = document.getElementById('dir');
const sapaList = document.getElementById('sapaList');

// --- Constants ---
const MAX_ROAD_CANDIDATE_DISTANCE_M = 500;
const MAX_BEARING_DIFFERENCE_DEG = 45;
const RBUSH_SEARCH_RADIUS_DEGREES = 0.5;
const MIN_SPEED_FOR_HEADING_MPS = 1.5;
const MIN_SPEED_FOR_DIRECTION_MPS = 0.5;
const MIN_SPEED_FOR_ETA_MPS = 0.5;
const DEMO_INTERVAL_MS = 2000; // Update every 2 seconds in demo mode

// --- Geolocation Watch ID ---
let watchId = null;

// --- Facility Icons ---
const facilityIcons = { "GAS": "⛽️", "EV": "⚡️", "SHOP": "🛍", "RESTAURANT": "🍴", "WC": "🚻", "INFO": "ℹ️", "CAFE": "☕", "SNACK": "🍿" };

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        roadDisplay.textContent = 'データをロード中...';
        if (typeof rbush === 'undefined') throw new Error('rbush library not found.');
        roadTree = rbush();

        const [roadsResponse, sapasResponse, demoRouteResponse] = await Promise.all([
            fetch('./data/roads.geojson'),
            fetch('./data/sapas.json'),
            fetch('./data/demo_route_sample.json') // Load demo route
        ]);

        if (!roadsResponse.ok) throw new Error(`Failed to load roads.geojson: ${roadsResponse.statusText}`);
        if (!sapasResponse.ok) throw new Error(`Failed to load sapas.json: ${sapasResponse.statusText}`);
        if (!demoRouteResponse.ok) throw new Error(`Failed to load demo_route_sample.json: ${demoRouteResponse.statusText}`);

        roadsData = await roadsResponse.json();
        sapasData = await sapasResponse.json();
        demoRouteData = await demoRouteResponse.json(); // Store demo data

        if (!roadsData || !roadsData.features) throw new Error('roads.geojson is invalid or has no features.');
        if (!sapasData || !Array.isArray(sapasData)) throw new Error('sapas.json is invalid or not an array.');
        if (!demoRouteData || !Array.isArray(demoRouteData) || demoRouteData.length === 0) throw new Error('demo_route_sample.json is invalid, not an array, or empty.');


        if (typeof turf === 'undefined' || !turf.bbox || !turf.point || !turf.nearestPointOnLine || !turf.bearing || !turf.distance || !turf.helpers || !turf.meta || !turf.length) {
            throw new Error('Turf.js not found or incomplete.');
        }

        roadsData.features.forEach(feature => {
            if (feature.geometry && feature.properties && feature.properties.id) {
                const featureBbox = turf.bbox(feature);
                roadTree.insert({ minX: featureBbox[0], minY: featureBbox[1], maxX: featureBbox[2], maxY: featureBbox[3], id: feature.properties.id });
            }
        });

        console.log('All data loaded and road tree populated.');
        roadDisplay.textContent = 'データロード完了';
        if(btnStart) btnStart.disabled = false;
        if(btnDemo) btnDemo.disabled = false; // Enable demo button after data loads

    } catch (error) {
        console.error('Initialization error:', error);
        alert(`初期化エラー: ${error.message}`);
        if(roadDisplay) roadDisplay.textContent = `エラー: ${error.message}`;
        if(btnStart) btnStart.disabled = true;
        if(btnDemo) btnDemo.disabled = true;
    }
});

// --- Geolocation / Demo Mode Functions ---
function processDemoPoint() {
    if (!demoRouteData || currentDemoPointIndex >= demoRouteData.length) {
        console.log("Demo route finished or no data.");
        stopDemoMode(); // Automatically stop if route ends
        roadDisplay.textContent = "デモ終了";
        return;
    }

    const point = demoRouteData[currentDemoPointIndex];
    const simulatedPosition = {
        coords: {
            latitude: point.latitude,
            longitude: point.longitude,
            speed: point.speed,
            heading: point.heading,
            accuracy: point.accuracy || 10 // Default accuracy if not specified
        },
        timestamp: Date.now() // Simulate a timestamp
    };

    console.log("Processing demo point:", currentDemoPointIndex, simulatedPosition.coords);
    handlePositionUpdate(simulatedPosition);
    currentDemoPointIndex++;
}

function startDemoMode() {
    if (isDemoModeActive) return;
    console.log("Starting Demo Mode...");
    isDemoModeActive = true;

    if (watchId !== null) { // Stop live GPS if running
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        btnStart.textContent = '現在位置を取得';
    }
    btnStart.disabled = true;
    btnDemo.textContent = 'デモモード停止';

    currentDemoPointIndex = 0;
    previousPosition = null; // Reset previous position for demo
    currentPosition = null;

    // Initial point
    processDemoPoint();
    // Subsequent points via interval
    if (demoRouteData && demoRouteData.length > 1) { // Only set interval if more points exist
        demoIntervalId = setInterval(processDemoPoint, DEMO_INTERVAL_MS);
    } else if (demoRouteData && demoRouteData.length === 1) {
        // If only one point, just display it and then indicate demo end
        setTimeout(() => {
             roadDisplay.textContent = "デモ終了 (1点のみ)";
             stopDemoMode();
        }, DEMO_INTERVAL_MS);
    } else {
        roadDisplay.textContent = "デモデータなし";
        stopDemoMode();
    }
}

function stopDemoMode() {
    if (!isDemoModeActive) return;
    console.log("Stopping Demo Mode...");
    isDemoModeActive = false;

    if (demoIntervalId !== null) {
        clearInterval(demoIntervalId);
        demoIntervalId = null;
    }
    btnStart.disabled = false;
    btnDemo.textContent = 'デモモード開始';
    // Optionally clear UI or show "Demo stopped" message
    // roadDisplay.textContent = 'デモモード停止';
}


function handlePositionUpdate(position) {
    if (!turf || !turf.point) {
        console.warn("Turf.js not available yet in handlePositionUpdate");
        roadDisplay.textContent = 'Turf.js準備中...';
        return;
    }
    // For demo mode, previousPosition is set from the actual previous demo point
    // to ensure correct bearing calculation between synthetic points.
    // For live GPS, previousPosition is the last currentPosition.
    if (isDemoModeActive) {
        if (currentDemoPointIndex > 0 && demoRouteData && demoRouteData[currentDemoPointIndex - 1]) {
            // Note: currentDemoPointIndex is already incremented for the *next* point
            // so demoRouteData[currentDemoPointIndex - 1] is the point being processed *now*
            // and demoRouteData[currentDemoPointIndex - 2] would be the one *before* that.
            // We need the point that was processed in the *previous* call to handlePositionUpdate.
            const prevIndex = currentDemoPointIndex - 2; // Index of the point processed in the previous step
            if (prevIndex >=0 && demoRouteData[prevIndex]) {
                 const prevDemoPoint = demoRouteData[prevIndex];
                 previousPosition = {
                    coords: {
                        latitude: prevDemoPoint.latitude,
                        longitude: prevDemoPoint.longitude,
                    }
                };
            } else {
                previousPosition = null; // No previous point for the very first demo point
            }
        } else {
             previousPosition = null; // First demo point
        }
    } else {
        previousPosition = currentPosition;
    }

    currentPosition = position;

    const { latitude, longitude, speed, heading, accuracy } = position.coords;
    const userSpeedMPS = speed;

    latlonDisplay.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)} (精度:${accuracy.toFixed(0)}m)`;
    speedDisplay.textContent = userSpeedMPS !== null ? (userSpeedMPS * 3.6).toFixed(1) : '---';
    bearingDisplay.textContent = heading !== null ? heading.toFixed(1) : '---';

    const userPoint = turf.point([longitude, latitude]);

    if (roadsData && sapasData && roadTree) {
        const matched = matchRoad(userPoint, heading, userSpeedMPS);

        if (matched) {
            const { roadFeature, pointOnLine, userMovementBearing } = matched;
            const travelDirection = determineDirection(roadFeature, pointOnLine, userMovementBearing, userSpeedMPS);
            const directionDisplayString = travelDirection ? travelDirection.display : '不明';
            dirDisplay.textContent = directionDisplayString;
            const currentKp = calculateKilopost(roadFeature, pointOnLine, travelDirection ? travelDirection.raw : roadFeature.properties.dir);

            if (currentKp !== null) {
                roadDisplay.textContent = `${roadFeature.properties.name} (${currentKp.toFixed(1)} kp)`;
                const nextSapas = findNextSapas(roadFeature.properties.id, currentKp, userSpeedMPS, travelDirection);
                updateSapaList(nextSapas);
            } else {
                 roadDisplay.textContent = `${roadFeature.properties.name} (KP計算不可)`;
                 sapaList.innerHTML = '<li>KPが計算できないためSAPA情報なし</li>';
            }
        } else {
            roadDisplay.textContent = '対応路線外または低速/静止中';
            dirDisplay.textContent = '---';
            sapaList.innerHTML = '<li>路線外のためSAPA情報なし</li>';
        }
    } else {
        roadDisplay.textContent = 'データ未ロード';
    }
}

function handlePositionError(error) {
    console.error('Geolocation error:', error);
    alert(`位置情報エラー: ${error.message}`);
    latlonDisplay.textContent = `エラー: ${error.message}`;
    roadDisplay.textContent = '位置情報取得エラー';
    sapaList.innerHTML = '<li>位置情報エラーのためSAPA情報なし</li>';
    if (btnStart) {
        btnStart.textContent = '現在位置を取得';
        btnStart.disabled = false;
        if (btnDemo) btnDemo.disabled = false; // Re-enable demo if GPS fails
    }
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
}

// --- Road Matching Logic ---
function matchRoad(userGeoPt, userDeviceHeading, userSpeed) {
    if (!roadsData || !roadTree || !turf) return null;
    const userCoords = turf.getCoord(userGeoPt);
    const searchBox = { minX: userCoords[0] - RBUSH_SEARCH_RADIUS_DEGREES, minY: userCoords[1] - RBUSH_SEARCH_RADIUS_DEGREES, maxX: userCoords[0] + RBUSH_SEARCH_RADIUS_DEGREES, maxY: userCoords[1] + RBUSH_SEARCH_RADIUS_DEGREES };
    const candidateIds = roadTree.search(searchBox).map(item => item.id);
    if (candidateIds.length === 0) return null;
    let bestMatch = null;
    let minDistanceToRoad = Infinity;
    let userMovementBearing = null;

    if (userDeviceHeading !== null && userSpeed !== null && userSpeed > MIN_SPEED_FOR_HEADING_MPS) {
        userMovementBearing = userDeviceHeading;
    }
    else if (previousPosition && currentPosition) {
        const prevCoords = [previousPosition.coords.longitude, previousPosition.coords.latitude];
        const currentCoords = [currentPosition.coords.longitude, currentPosition.coords.latitude]; // Use currentPosition for turf.point
        if (turf.distance(turf.point(prevCoords), turf.point(currentCoords), {units: 'meters'}) > 1) {
             userMovementBearing = turf.bearing(turf.point(prevCoords), turf.point(currentCoords));
        }
    }

    candidateIds.forEach(roadId => {
        const roadFeature = roadsData.features.find(f => f.properties.id === roadId);
        if (!roadFeature || !roadFeature.geometry) return;
        const snapped = turf.nearestPointOnLine(roadFeature.geometry, userGeoPt, { units: 'kilometers' });
        const distanceToUserMeters = turf.distance(userGeoPt, snapped, { units: 'meters' });
        if (distanceToUserMeters > MAX_ROAD_CANDIDATE_DISTANCE_M) return;

        if (userMovementBearing !== null) {
            const lineSegment = getSegmentAtPoint(roadFeature.geometry, snapped);
            if (!lineSegment) return;
            const segmentBearing = turf.bearing(turf.point(lineSegment[0]), turf.point(lineSegment[1]));
            const bearingDiff = Math.abs(normalizeBearing(userMovementBearing - segmentBearing));
            const reverseSegmentBearing = normalizeBearing(segmentBearing + 180);
            const bearingDiffReverse = Math.abs(normalizeBearing(userMovementBearing - reverseSegmentBearing));
            if (Math.min(bearingDiff, bearingDiffReverse) > MAX_BEARING_DIFFERENCE_DEG) return;
        } else if (userSpeed > MIN_SPEED_FOR_DIRECTION_MPS) { /* Proceed without bearing check */ }
        else if (userSpeed <= MIN_SPEED_FOR_DIRECTION_MPS) { /* Stationary, bearing check skipped */ }

        if (distanceToUserMeters < minDistanceToRoad) {
            minDistanceToRoad = distanceToUserMeters;
            bestMatch = { roadFeature, pointOnLine: snapped, distance: distanceToUserMeters, userMovementBearing };
        }
    });
    return bestMatch;
}

function getSegmentAtPoint(lineStringFeature, snappedPoint) {
    if (!lineStringFeature || !snappedPoint || !lineStringFeature.geometry || !lineStringFeature.geometry.coordinates) return null;
    const coords = lineStringFeature.geometry.coordinates;
    if (coords.length < 2) return null;
    let segmentIndex = snappedPoint.properties.index;
    if (segmentIndex >= coords.length -1 ) segmentIndex = coords.length - 2;
    return [coords[segmentIndex], coords[segmentIndex + 1]];
}
function normalizeBearing(bearing) {
    bearing = bearing % 360;
    if (bearing > 180) bearing -= 360;
    if (bearing <= -180) bearing += 360;
    return bearing;
}

// --- Direction and Kilopost Calculation ---
function determineDirection(roadFeature, pointOnLine, userMovementBearing, userSpeed) {
    if (userMovementBearing === null || userSpeed === null || userSpeed < MIN_SPEED_FOR_DIRECTION_MPS) return null;
    const lineSegment = getSegmentAtPoint(roadFeature.geometry, pointOnLine);
    if (!lineSegment) return null;
    const segmentBearing = turf.bearing(turf.point(lineSegment[0]), turf.point(lineSegment[1]));
    const diffToSegment = Math.abs(normalizeBearing(userMovementBearing - segmentBearing));
    const digitizedDir = roadFeature.properties.dir;
    let actualTravelDir = digitizedDir;
    if (diffToSegment > 90) actualTravelDir = (digitizedDir === "up") ? "down" : "up";
    let displayDir = "不明";
    const roadName = roadFeature.properties.name || "";
    if (actualTravelDir === "up") displayDir = roadName.includes("内回") ? "内回り" : (roadName.includes("外回") ? "外回り" : "上り");
    else if (actualTravelDir === "down") displayDir = roadName.includes("外回") ? "外回り" : (roadName.includes("内回") ? "内回り" : "下り");
    return { raw: actualTravelDir, display: displayDir };
}
function calculateKilopost(roadFeature, pointOnLine, travelDirectionRaw) {
    let kp = pointOnLine.properties.location;
    if (kp === undefined || kp === null) return null;
    return kp;
}

// --- SAPA Search and UI Update ---
function findNextSapas(currentRoadId, currentKp, userSpeedMPS, travelDirection) {
    if (!sapasData || currentKp === null || !travelDirection) return [];
    const isKpIncreasing = travelDirection.raw === 'down';
    const filteredSapas = sapasData.filter(s => {
        if (s.road_id !== currentRoadId) return false;
        return isKpIncreasing ? s.kp > currentKp : s.kp < currentKp;
    });
    filteredSapas.sort((a, b) => isKpIncreasing ? a.kp - b.kp : b.kp - a.kp);
    const nextTwoSapas = filteredSapas.slice(0, 2);
    return nextTwoSapas.map(sapa => {
        const distanceToSapaKm = Math.abs(sapa.kp - currentKp);
        let timeToSapaMinutes = null;
        if (userSpeedMPS !== null && userSpeedMPS > MIN_SPEED_FOR_ETA_MPS) {
            timeToSapaMinutes = (distanceToSapaKm * 1000) / userSpeedMPS / 60;
        }
        return { ...sapa, distanceToSapaKm, timeToSapaMinutes };
    });
}
function updateSapaList(nextSapas) {
    sapaList.innerHTML = '';
    if (!nextSapas || nextSapas.length === 0) {
        const li = document.createElement('li');
        li.textContent = '前方にSAPA情報なし';
        sapaList.appendChild(li);
        return;
    }
    nextSapas.forEach(sapa => {
        const li = document.createElement('li');
        let etaString = '--- 分';
        if (sapa.timeToSapaMinutes !== null) etaString = `${sapa.timeToSapaMinutes.toFixed(0)} 分`;
        const facilitiesString = (sapa.facilities && Array.isArray(sapa.facilities))
            ? sapa.facilities.map(fac => facilityIcons[fac] || fac).join(' ')
            : '';
        li.innerHTML = `<strong>${sapa.name}</strong> — 約 ${sapa.distanceToSapaKm.toFixed(1)} km・${etaString}<br>設備: ${facilitiesString}${sapa.url ? ` <a href="${sapa.url}" target="_blank" rel="noopener">詳細</a>` : ''}`;
        sapaList.appendChild(li);
    });
}

// --- Event Listeners ---
if (btnStart) {
    btnStart.disabled = true;
    btnStart.addEventListener('click', () => {
        if (watchId === null) { // Start live GPS
            if (navigator.geolocation) {
                if (isDemoModeActive) stopDemoMode(); // Stop demo if it was running
                btnDemo.disabled = true; // Disable demo button

                roadDisplay.textContent = '位置情報取得中...';
                // Clear UI fields
                latlonDisplay.textContent = '---';
                speedDisplay.textContent = '---';
                bearingDisplay.textContent = '---';
                dirDisplay.textContent = '---';
                sapaList.innerHTML = '';

                watchId = navigator.geolocation.watchPosition(
                    handlePositionUpdate,
                    handlePositionError,
                    { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 }
                );
                btnStart.textContent = '取得停止';
            } else {
                alert('このブラウザは位置情報をサポートしていません。');
            }
        } else { // Stop live GPS
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
            btnStart.textContent = '現在位置を取得';
            btnDemo.disabled = false; // Re-enable demo button
            roadDisplay.textContent = '位置情報取得停止';
        }
    });
}

if (btnDemo) {
    btnDemo.disabled = true; // Initially disabled until data loads
    btnDemo.addEventListener('click', () => {
        if (isDemoModeActive) {
            stopDemoMode();
        } else {
            startDemoMode();
        }
    });
}

console.log('main.js loaded with Demo Mode logic.');
