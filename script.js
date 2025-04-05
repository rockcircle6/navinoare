// Overpass APIで高速道路データを取得
async function fetchHighwayData(lat, lon) {
    console.log("fetchHighwayData開始:", { lat, lon });
    const query = `[out:json];way["highway"="motorway"](around:500,${lat},${lon});out body;node(w);out body;`;
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

// 2点間の距離
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
        return { highway: "高速道路外", direction: "なし", distance: null };
    }

    let closestHighway = null;
    let minDistance = Infinity;
    let closestSegment = null;

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
            if (dist < minDistance) {
                minDistance = dist;
                closestHighway = highwayName;
                closestSegment = { start: geometry[i], end: geometry[i + 1] };
            }
        }
    }

    if (minDistance < 0.0003 && closestSegment) {
        let direction = "不明";
        if (heading !== null) {
            // セグメントの向きを計算
            const segmentHeading = getSegmentHeading(closestSegment.start, closestSegment.end);
            console.log("セグメントの向き:", segmentHeading);

            // テスラの進行方向とセグメントの向きを比較
            const headingDiff = Math.abs((heading - segmentHeading + 540) % 360 - 180);
            console.log("進行方向との差:", headingDiff);

            // 環状道路かどうか（簡易的に名前で判定）
            const isCircular = closestHighway.includes("首都") || closestHighway.includes("環状") || closestHighway.includes("高速");

            // 差が90°以内なら同じ方向、180°±90°なら逆方向
            if (headingDiff < 90) {
                direction = isCircular ? "内回り" : "上り";
            } else if (headingDiff > 90) {
                direction = isCircular ? "外回り" : "下り";
            }
        }
        console.log("判定結果:", { highway: closestHighway, direction, distance: minDistance });
        return { highway: closestHighway, direction, distance: minDistance };
    }
    console.log("判定結果: 高速道路外");
    return { highway: "高速道路外", direction: "なし", distance: minDistance };
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