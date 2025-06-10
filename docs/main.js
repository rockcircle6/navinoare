// --- Global Variables ---
let roadsData = null;
let sapasData = null;
let roadTree = null;
let currentPosition = null;
let previousPosition = null;

// --- DOM Elements ---
const btnStart = document.getElementById('btnStart');
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
const MIN_SPEED_FOR_ETA_MPS = 0.5; // Min speed in m/s to calculate ETA

// --- Geolocation Watch ID ---
let watchId = null;

// --- Facility Icons ---
const facilityIcons = {
    "GAS": "⛽️",
    "EV": "⚡️",
    "SHOP": "🛍",
    "RESTAURANT": "🍴",
    "WC": "🚻", // Common, though not in spec example
    "INFO": "ℹ️", // Common
    "CAFE": "☕",
    "SNACK": "🍿",
    // Add more as needed based on actual data in sapas.json
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        roadDisplay.textContent = 'データをロード中...';
        if (typeof rbush === 'undefined') {
            console.error('rbush library is not loaded!');
            alert('Error: rbush library not found.');
            roadDisplay.textContent = 'エラー: rbushライブラリが見つかりません';
            return;
        }
        roadTree = rbush();

        const [roadsResponse, sapasResponse] = await Promise.all([
            fetch('./data/roads.geojson'),
            fetch('./data/sapas.json')
        ]);

        if (!roadsResponse.ok) throw new Error(`Failed to load roads.geojson: ${roadsResponse.statusText}`);
        if (!sapasResponse.ok) throw new Error(`Failed to load sapas.json: ${sapasResponse.statusText}`);

        roadsData = await roadsResponse.json();
        sapasData = await sapasResponse.json();

        if (!roadsData || !roadsData.features) throw new Error('roads.geojson is invalid or has no features.');
        if (!sapasData || !Array.isArray(sapasData)) throw new Error('sapas.json is invalid or not an array.');


        if (typeof turf === 'undefined' || !turf.bbox || !turf.point || !turf.nearestPointOnLine || !turf.bearing || !turf.distance || !turf.helpers || !turf.meta || !turf.length) {
            console.error('Turf.js or required Turf modules are not loaded!');
            alert('Error: Turf.js not found or incomplete.');
            roadDisplay.textContent = 'エラー: Turf.js が見つかりません';
            return;
        }

        roadsData.features.forEach(feature => {
            if (feature.geometry && feature.properties && feature.properties.id) {
                const featureBbox = turf.bbox(feature);
                roadTree.insert({
                    minX: featureBbox[0],
                    minY: featureBbox[1],
                    maxX: featureBbox[2],
                    maxY: featureBbox[3],
                    id: feature.properties.id
                });
            } else {
                console.warn('Skipping road feature due to missing geometry or properties.id:', feature);
            }
        });

        console.log('Roads and SAPAs data loaded and road tree populated.');
        roadDisplay.textContent = 'データロード完了';
        if(btnStart) btnStart.disabled = false;

    } catch (error) {
        console.error('Initialization error:', error);
        alert(`初期化エラー: ${error.message}`);
        if(roadDisplay) roadDisplay.textContent = `エラー: ${error.message}`;
        if(btnStart) btnStart.disabled = true;
    }
});

// --- Geolocation Functions ---
function handlePositionUpdate(position) {
    if (!turf || !turf.point) {
        console.warn("Turf.js not available yet in handlePositionUpdate");
        roadDisplay.textContent = 'Turf.js準備中...';
        return;
    }
    previousPosition = currentPosition;
    currentPosition = position;

    const { latitude, longitude, speed, heading, accuracy } = position.coords;
    const userSpeedMPS = speed;
    // console.log(`Pos Update: Lat: ${latitude}, Lon: ${longitude}, Speed: ${userSpeedMPS}, Head: ${heading}, Acc: ${accuracy}m`);

    latlonDisplay.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)} (精度:${accuracy.toFixed(0)}m)`;
    speedDisplay.textContent = userSpeedMPS !== null ? (userSpeedMPS * 3.6).toFixed(1) : '---';
    bearingDisplay.textContent = heading !== null ? heading.toFixed(1) : '---';

    const userPoint = turf.point([longitude, latitude]);

    if (roadsData && sapasData && roadTree) {
        // roadDisplay.textContent = '路線照合中...'; // This flickers too much
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

    if (userDeviceHeading !== null && userSpeed !== null && userSpeed > MIN_SPEED_FOR_HEADING_MPS) userMovementBearing = userDeviceHeading;
    else if (previousPosition && currentPosition) {
        const prevCoords = [previousPosition.coords.longitude, previousPosition.coords.latitude];
        if (turf.distance(turf.point(prevCoords), userGeoPt, {units: 'meters'}) > 5) userMovementBearing = turf.bearing(turf.point(prevCoords), userGeoPt);
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
    // Basic mapping, can be more sophisticated based on road name patterns or explicit type property.
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
    if (!sapasData || currentKp === null || !travelDirection) {
        return [];
    }

    const isKpIncreasing = travelDirection.raw === 'down'; // Assuming 'down' means KP increases

    const filteredSapas = sapasData.filter(s => {
        if (s.road_id !== currentRoadId) return false;
        return isKpIncreasing ? s.kp > currentKp : s.kp < currentKp;
    });

    filteredSapas.sort((a, b) => {
        return isKpIncreasing ? a.kp - b.kp : b.kp - a.kp;
    });

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
    sapaList.innerHTML = ''; // Clear previous list

    if (!nextSapas || nextSapas.length === 0) {
        const li = document.createElement('li');
        li.textContent = '前方にSAPA情報なし';
        sapaList.appendChild(li);
        return;
    }

    nextSapas.forEach(sapa => {
        const li = document.createElement('li');

        let etaString = '--- 分';
        if (sapa.timeToSapaMinutes !== null) {
            etaString = `${sapa.timeToSapaMinutes.toFixed(0)} 分`;
        }

        const facilitiesString = (sapa.facilities && Array.isArray(sapa.facilities))
            ? sapa.facilities.map(fac => facilityIcons[fac] || fac).join(' ')
            : '';

        li.innerHTML = `<strong>${sapa.name}</strong> — 約 ${sapa.distanceToSapaKm.toFixed(1)} km・${etaString}<br>
                        設備: ${facilitiesString}
                        ${sapa.url ? `<a href="${sapa.url}" target="_blank" rel="noopener">詳細</a>` : ''}`;
        sapaList.appendChild(li);
    });
}

// --- Event Listeners ---
if (btnStart) {
    btnStart.disabled = true;
    btnStart.addEventListener('click', () => {
        if (watchId === null) {
            if (navigator.geolocation) {
                roadDisplay.textContent = '位置情報取得中...';
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
        } else {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
            btnStart.textContent = '現在位置を取得';
            roadDisplay.textContent = '位置情報取得停止';
        }
    });
}

console.log('main.js loaded with SAPA search and UI update logic.');
