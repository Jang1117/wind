const weatherCache = {};
const CACHE_DURATION = 10 * 60 * 1000; // 10분

// 위도/경도를 격자 좌표로 변환
function latLonToGrid(lat, lon) {
  const RE = 6371.00877; // 지구 반경(km)
  const GRID = 5.0; // 격자 간격(km)
  const SLAT1 = 30.0; // 투영 위도1(degree)
  const SLAT2 = 60.0; // 투영 위도2(degree)
  const OLON = 126.0; // 기준 경도(degree)
  const OLAT = 38.0; // 기준 위도(degree)
  const XO = 43; // 기준점 X좌표(격자)
  const YO = 136; // 기준점 Y좌표(격자)

  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + (lat * DEGRAD) * 0.5);
  ra = re * sf / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  let nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  let ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);

  return { nx, ny };
}

// 날씨 데이터 가져오기
async function fetchWeatherData(lat, lon, complexId) {
  const now = Date.now();
  if (weatherCache[complexId] && (now - weatherCache[complexId].timestamp < CACHE_DURATION)) {
    console.log(`캐시된 날씨 데이터 사용: ${complexId}`);
    return weatherCache[complexId].data;
  }

  try {
    // 격자 좌표 변환
    const { nx, ny } = latLonToGrid(lat, lon);
    console.log(`격자 좌표: nx=${nx}, ny=${ny}`);

    // 현재 시간 기준 base_date, base_time 설정
    const nowDate = new Date();
    const baseDate = nowDate.toISOString().slice(0, 10).replace(/-g/, ''); // YYYYMMDD
    const baseTime = `${String(nowDate.getHours()).padStart(2, '0')}00`; // HHMM

    const authKey = 'WK5jFMdMTCeuYxTHTEwniw';
    const url = `https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtNcst?pageNo=1&numOfRows=10&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}&authKey=${authKey}`;
    
    console.log(`날씨 데이터 요청: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP 오류! 상태: ${response.status}`);
    }

    const data = await response.json();
    if (data.response.header.resultCode !== '00') {
      throw new Error(`API 오류: ${data.response.header.resultMsg}`);
    }

    // 풍속(WSD), 풍향(VEC) 추출
    const items = data.response.body.items.item;
    let windSpeed = null;
    let windDirection = null;

    for (const item of items) {
      if (item.category === 'WSD') windSpeed = parseFloat(item.obsrValue);
      if (item.category === 'VEC') windDirection = parseInt(item.obsrValue);
    }

    if (windSpeed === null || windDirection === null) {
      throw new Error('풍속 또는 풍향 데이터 누락');
    }

    const weather = {
      windSpeed10m: windSpeed,
      windDirection10m: windDirection,
      time: `${baseDate}T${baseTime}`
    };

    weatherCache[complexId] = {
      data: weather,
      timestamp: now
    };
    console.log(`날씨 데이터 로드 성공: ${complexId}`, weather);
    return weather;
  } catch (error) {
    console.error(`날씨 데이터 로드 실패: ${complexId}`, error);
    showError(translations[isEnglish ? 'en' : 'ko'].errorMessage.weatherLoad.replace('{{message}}', error.message));
    return null;
  }
}