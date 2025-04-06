// 全国の高速道路データ（GitHubから読み込み）
let highwayData = [];

// OpenRouteService APIキー（ユーザーが入力）
let apiKey = null;

// APIキーを設定
function setApiKey() {
    const apiKeyInput = document.getElementById("apiKey").value;
    if (apiKeyInput) {
        apiKey = apiKeyInput;
        console.log("APIキーが設定されました:", apiKey);
        alert("APIキーが設定されました。位置情報を取得できます。");
    } else {
        alert("APIキーを入力してください。");
    }
}

// JSONデータをGitHubから読み込む
fetch('https://raw.githubusercontent.com/rockcircle6/navinoare/main/highways.json')
    .then(response => {
        if (!response.ok) {
            throw new Error('highways.jsonの読み込みに失敗しました');
        }
        return response.json();
    })
    .then(data => {
        highwayData = data;
        console.log("highways.jsonを読み込みました:", highwayData);
    })
    .catch(error => {
        console.error("highways.jsonの読み込みに失敗しました:", error);
        highwayData = [];
    });

// OpenRouteService APIで道なりの距離を取得
async function fetchRouteDistance(startLon, startLat, endLon, endLat) {
    if (!apiKey) {
        console.error("OpenRouteService APIキーが設定されていません");
        return null;
    }

    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${startLon},${startLat}&end=${endLon},${endLat}`;
    try {
        console.log("OpenRouteServiceリクエスト送信:", url);
        const response = await fetch(url);
        console.log("OpenRouteServiceレスポンス受信:", response);
        const data = await response.json();
        console.log("OpenRouteServiceデータ:", data);
        if (data.routes && data.routes.length > 0) {
            return data.routes[0].distance / 1000; // 距離（メートル）をkmに変換
        } else {
            console.warn("ルートが見つかりませんでした");
            return null;
        }
    } catch (error) {
        console.error("OpenRouteServiceエラー:", error);
        return null;
    }
}

// Overpass APIで高速道路データを取得
async function fetchHighwayData(lat, lon) {
    console.log("fetchHighwayData開始:", { lat, lon });
    const query = `[out:json];way["highway"="motorway"](around:500,${lat},${lon});out body;node(w);out center;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    try {
        console.log("Overpass APIリクエスト送信:", url);
        const response = await fetch(url);
        console.log("Overpass APIレスポンス受信:", response);
        const data = await response.json();
        console.log("Overpass APIデータ:", data);
        return data.elements || [];
    } catch (error) {
        console.error("Overpass APIエラー:", error);
        return [];
    }
}

// Overpass APIでSAやJCTを取得
async function fetchFacilities(lat, lon, highwayName) {
    console.log("fetchFacilities開始:", { lat, lon, highwayName });
    const query = `[out:json];(node["highway"="services"]["name"~"${highwayName}"](around:50000,${lat},${lon});node["highway"="motorway_junction"]["name"~"${highwayName}"](around:50000,${lat},${lon}););out center;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    try {
        console.log("Overpass APIリクエスト送信（施設）:", url);
        const response = await fetch(url);
        console.log("Overpass APIレスポンス受信（施設）:", response);
        const data = await response.json();
        console.log("Overpass APIデータ（施設）:", data);
        return data.elements || [];
    } catch (error) {
        console.error("Overpass APIエラー（施設）:", error);
        return [];
    }
}

// 2点間の距離（直線距離、フォールバック用）
function getDistance(lat1, lon1, lat2, lon2) {
    return Math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2);
}

// 点と線の最短距離
function pointToLineDistance(lat, lon, point1, point2) {
    const x = lat, y = lon;
    const x1 = point1.lat, y1 = point1.lon;
    const x2 = point2.lat, y2 = point2.lon;

    const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (lengthSquared === 0) return getDistance(x, y, x1, y1);

    let t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const projectionX = x1 + t * (x2 - x1);
    const projectionY = y1 + t * (y2 - y1);

    return getDistance(x, y, projectionX, projectionY);
}

// セグメントの向き（角度）を計算
function getSegmentHeading(start, end) {
    const deltaLat = end.lat - start.lat;
    const deltaLon = end.lon - start.lon;
    const angle = Math.atan2(deltaLon, deltaLat) * (180 / Math.PI);
    return (angle + 360) % 360; // 0〜360°に正規化
}

// キロポスト（KP）を計算（JSONデータとルート計算APIを使用）
async function calculateKilopost(lat, lon, highwayName) {
    const highway = highwayData.find(h => h["高速道路名"] === highwayName);
    if (!highway) {
        console.warn("高速道路データが見つかりません:", highwayName);
        return null;
    }

    const startLat = highway["始点緯度"];
    const startLon = highway["始点経度"];
    const endLat = highway["終点緯度"];
    const endLon = highway["終点経度"];
    const startKP = highway["始点キロポスト"];
    const endKP = highway["終点キロポスト"];
    const totalLength = endKP - startKP; // 総距離（km）

    // 始点から現在位置までの道なりの距離を取得
    const distFromStart = await fetchRouteDistance(startLon, startLat, lon, lat);
    if (distFromStart === null) {
        console.warn("道なりの距離が取得できませんでした。直線距離でフォールバックします。");
        const dist = getDistance(lat, lon, startLat, startLon) * 111000; // メートル単位
        const distFromEnd = getDistance(lat, lon, endLat, endLon) * 111000;
        const totalDist = getDistance(startLat, startLon, endLat, endLon) * 111000;
        const ratio = totalDist > 0 ? dist / totalDist : 0;
        const kp = startKP + (ratio * totalLength);
        return Math.min(Math.max(kp, startKP), endKP);
    }

    // 終点から現在位置までの道なりの距離を取得
    const distFromEnd = await fetchRouteDistance(lon, lat, endLon, endLat);
    if (distFromEnd === null) {
        console.warn("終点までの道なりの距離が取得できませんでした。直線距離でフォールバックします。");
        const dist = getDistance(lat, lon, startLat, startLon) * 111000;
        const distFromEnd = getDistance(lat, lon, endLat, endLon) * 111000;
        const totalDist = getDistance(startLat, startLon, endLat, endLon) * 111000;
        const ratio = totalDist > 0 ? dist / totalDist : 0;
        const kp = startKP + (ratio * totalLength);
        return Math.min(Math.max(kp, startKP), endKP);
    }

    // 始点から現在位置までの距離を基にキロポストを計算
    const kp = startKP + distFromStart;
    return Math.min(Math.max(kp, startKP), endKP); // 範囲内に収める
}

// 高速道路判定（JSONデータから名前を取得）
async function checkHighway(lat, lon, heading = null) {
    console.log("checkHighway開始:", { lat, lon, heading });
    const elements = await fetchHighwayData(lat, lon);
    console.log("elements取得:", elements);

    // ノードIDから座標へのマッピングを作成
    const nodeMap = {};
    elements
        .filter(element => element.type === "node")
        .forEach(node => {
            nodeMap[node.id] = { lat: node.lat, lon: node.lon };
        });
    console.log("nodeMap:", nodeMap);

    // way（高速道路）だけをフィルタ
    const highways = elements.filter(element => element.type === "way");
    console.log("highwaysフィルタ:", highways);
    if (!highways || highways.length === 0) {
        console.log("高速道路なし");
        return { highway: "高速道路外", direction: "なし", distance: null, kilopost: null, upcomingFacilities: [] };
    }

    let closestHighway = null;
    let minDistance = Infinity;
    let closestSegment = null;
    let closestGeometry = null;

    for (const highway of highways) {
        if (!highway.nodes || highway.nodes.length < 2) {
            console.warn("nodesがないデータ:", highway);
            continue;
        }

        // nodesからgeometryを構築
        const geometry = highway.nodes
            .map(nodeId => nodeMap[nodeId])
            .filter(node => node); // ノードが見つからない場合はスキップ
        if (geometry.length < 2) {
            console.warn("geometryを構築できないデータ:", highway);
            continue;
        }

        if (!highway.tags) {
            console.warn("tagsがないデータ:", highway);
            highway.tags = { name: "不明な高速道路" };
        }

        const highwayName = highway.tags.name || "不明な高速道路";
        console.log("判定中の高速道路:", highwayName);
        for (let i = 0; i < geometry.length - 1; i++) {
            const dist = pointToLineDistance(lat, lon, geometry[i], geometry[i + 1]);
            console.log(`セグメント ${i}: 距離 ${dist * 111000} m`);
            if (dist < minDistance) {
                minDistance = dist;
                closestHighway = highwayName;
                closestSegment = { start: geometry[i], end: geometry[i + 1] };
                closestGeometry = geometry;
            }
        }
    }

    if (minDistance < 0.0005 && closestSegment) {
        let direction = "不明";
        if (heading !== null) {
            const segmentHeading = getSegmentHeading(closestSegment.start, closestSegment.end);
            console.log("セグメントの向き:", segmentHeading);

            const headingDiff = Math.abs((heading - segmentHeading + 540) % 360 - 180);
            console.log("進行方向との差:", headingDiff);

            const isCircular = closestHighway.includes("首都") || closestHighway.includes("環状") || closestHighway.includes("高速");
            if (headingDiff < 90) {
                direction = isCircular ? "内回り" : "上り";
            } else if (headingDiff > 90) {
                direction = isCircular ? "外回り" : "下り";
            }
        }

        // キロポスト（KP）を計算（JSONデータとルート計算APIを使用）
        const kilopost = await calculateKilopost(lat, lon, closestHighway);
        console.log("キロポスト計算結果:", kilopost);

        // 前方のSAやJCTを取得
        const facilities = await fetchFacilities(lat, lon, closestHighway);
        console.log("取得した施設:", facilities);

        // 施設をキロポストでソート（簡易的にlat/lonから距離を計算）
        const facilitiesWithDistance = facilities.map(facility => {
            const dist = getDistance(lat, lon, facility.lat, facility.lon) * 111000; // メートル単位
            return { name: facility.tags.name, type: facility.tags.highway, distance: dist };
        }).filter(f => f.distance > 0); // 現在位置より前方のみ

        facilitiesWithDistance.sort((a, b) => a.distance - b.distance);
        const upcomingFacilities = facilitiesWithDistance.slice(0, 3); // 次の3つ

        console.log("判定結果:", { highway: closestHighway, direction, distance: minDistance, kilopost, upcomingFacilities });
        return { highway: closestHighway, direction, distance: minDistance, kilopost, upcomingFacilities };
    }
    console.log("判定結果: 高速道路外, 最小距離:", minDistance * 111000, "m");
    return { highway: "高速道路外", direction: "なし", distance: minDistance, kilopost: null, upcomingFacilities: [] };
}

// 位置情報取得と表示
function getLocation() {
    const infoDiv = document.getElementById("location-info");
    infoDiv.innerHTML = "<p>取得中...</p>";

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                console.log("位置情報取得:", position);
                const coords = position.coords;
                const timestamp = position.timestamp;

                const highwayInfo = await checkHighway(coords.latitude, coords.longitude, coords.heading);

                infoDiv.innerHTML = `
                    <h2>${highwayInfo.highway}</h2>
                    <p><strong>方向:</strong> ${highwayInfo.direction}</p>
                    <p><strong>キロポスト (KP):</strong> ${highwayInfo.kilopost !== null ? highwayInfo.kilopost.toFixed(2) : "不明"} km</p>
                    <p><strong>前方の施設:</strong></p>
                    <ul>
                        ${highwayInfo.upcomingFacilities && highwayInfo.upcomingFacilities.length > 0 ? highwayInfo.upcomingFacilities.map(f => `<li>${f.type === "services" ? "SA" : "JCT"}: ${f.name} (${f.distance.toFixed(2)} km)</li>`).join('') : '<li>なし</li>'}
                    </ul>
                    <p><strong>道路からの距離:</strong> ${highwayInfo.distance ? (highwayInfo.distance * 111000).toFixed(2) : "不明"} m</p>
                    <hr>
                    <p><strong>緯度 (Latitude):</strong> ${coords.latitude}</p>
                    <p><strong>経度 (Longitude):</strong> ${coords.longitude}</p>
                    <p><strong>高度 (Altitude):</strong> ${coords.altitude !== null ? coords.altitude + " m" : "取得不可"}</p>
                    <p><strong>位置精度 (Accuracy):</strong> ${coords.accuracy} m</p>
                    <p><strong>高度精度 (Altitude Accuracy):</strong> ${coords.altitudeAccuracy !== null ? coords.altitudeAccuracy + " m" : "取得不可"}</p>
                    <p><strong>進行方向 (Heading):</strong> ${coords.heading !== null ? coords.heading + "°" : "取得不可"}</p>
                    <p><strong>速度 (Speed):</strong> ${coords.speed !== null ? coords.speed + " m/s" : "取得不可"}</p>
                    <p><strong>取得時刻 (Timestamp):</strong> ${new Date(timestamp).toLocaleString()}</p>
                `;
            },
            (error) => {
                console.error("位置情報エラー:", error);
                infoDiv.innerHTML = `<p>エラー: ${error.message}</p>`;
            }
        );
    } else {
        infoDiv.innerHTML = "<p>このブラウザは位置情報をサポートしていません</p>";
    }
}

console.log("Highway app started!");