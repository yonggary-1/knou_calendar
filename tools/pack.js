// 배포용 zip 만들기 (외부 도구·패키지 없이 Node 기본 모듈만 사용)
//   node tools\pack.js            → dist\knou_calendar_chromium.zip, dist\knou_calendar_firefox.zip
//   먼저 node build.js 로 dist\chromium, dist\firefox 를 만들어 두어야 한다.
//
// 두 zip의 모양이 다르다 (일부러):
//  - chromium: 최상위에 knou_calendar_chromium\ 폴더 하나. 압축을 풀면 폴더가 생기고
//              사용자는 그 폴더를 "압축해제된 확장 프로그램 로드"로 고른다.
//  - firefox:  manifest.json 이 zip 최상위. Mozilla 서명 제출(AMO)이 이 형식을 요구한다.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- 날짜 (MS-DOS 형식) ----
function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else if (e.isFile()) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

// entries: [{ name: 'a/b.txt', data: Buffer }]
function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  const { time, date } = dosTime(new Date());
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const flags = 0x0800; // 파일 이름 UTF-8

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

function pack(target, zipName, prefix) {
  const dir = path.join(DIST, target);
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
    console.error(`${path.relative(ROOT, dir)} 가 없습니다. 먼저 node build.js 를 실행하세요.`);
    process.exit(1);
  }
  const files = listFiles(dir);
  const zip = makeZip(files.map((f) => ({ name: prefix + f, data: fs.readFileSync(path.join(dir, f)) })));
  const out = path.join(DIST, zipName);
  fs.writeFileSync(out, zip);
  const version = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).version;
  console.log(`묶음 완료: ${path.relative(ROOT, out)} (${target} ${version}, 파일 ${files.length}개)`);
}

pack('chromium', 'knou_calendar_chromium.zip', 'knou_calendar_chromium/');
pack('firefox', 'knou_calendar_firefox.zip', '');

// 릴리즈 첨부: 위젯 스크립트 그대로 (이름 고정 → releases/latest/download/KnouWidget.js 주소가 늘 통함)
fs.copyFileSync(path.join(ROOT, 'src', 'widget', 'KnouWidget.js'), path.join(DIST, 'KnouWidget.js'));
console.log('복사 완료: dist/KnouWidget.js');

module.exports = { makeZip, crc32 };
