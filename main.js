const STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
const BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
const MONTH_BRANCHES = ['인', '묘', '진', '사', '오', '미', '신', '유', '술', '해', '자', '축'];
const ELEMENTS = {
  갑: '목', 을: '목',
  병: '화', 정: '화',
  무: '토', 기: '토',
  경: '금', 신: '금',
  임: '수', 계: '수'
};
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const BASE_DAY_UTC_MS = kstToUtcMs(1984, 1, 2, 0, 0); // 1984-02-02 갑자일 기준

const SOLAR_TERM_DEFS = [
  { key: 'sohan', name: '소한', longitude: 285, monthIndex: 11, guessMonth: 0, guessDay: 5 },
  { key: 'ipchun', name: '입춘', longitude: 315, monthIndex: 0, guessMonth: 1, guessDay: 4 },
  { key: 'gyeongchip', name: '경칩', longitude: 345, monthIndex: 1, guessMonth: 2, guessDay: 5 },
  { key: 'cheongmyeong', name: '청명', longitude: 15, monthIndex: 2, guessMonth: 3, guessDay: 4 },
  { key: 'iphwa', name: '입하', longitude: 45, monthIndex: 3, guessMonth: 4, guessDay: 5 },
  { key: 'mangjong', name: '망종', longitude: 75, monthIndex: 4, guessMonth: 5, guessDay: 5 },
  { key: 'soseo', name: '소서', longitude: 105, monthIndex: 5, guessMonth: 6, guessDay: 7 },
  { key: 'ipchu', name: '입추', longitude: 135, monthIndex: 6, guessMonth: 7, guessDay: 7 },
  { key: 'baengno', name: '백로', longitude: 165, monthIndex: 7, guessMonth: 8, guessDay: 7 },
  { key: 'hanro', name: '한로', longitude: 195, monthIndex: 8, guessMonth: 9, guessDay: 8 },
  { key: 'ipdong', name: '입동', longitude: 225, monthIndex: 9, guessMonth: 10, guessDay: 7 },
  { key: 'daeseol', name: '대설', longitude: 255, monthIndex: 10, guessMonth: 11, guessDay: 7 }
];

const ELEMENT_COLORS = {
  목: '#3d8a4a',
  화: '#c23b22',
  토: '#b3813e',
  금: '#6e7b8b',
  수: '#2a6f91'
};

const FORM = document.getElementById('fortuneForm');
const RESULTS = document.getElementById('results');
const TODAY_LABEL = document.getElementById('todayLabel');
const TERM_FORM = document.getElementById('termTestForm');
const TERM_RESULT = document.getElementById('termTestResult');
const THEME_TOGGLE = document.getElementById('themeToggle');
const BIRTH_WARNING = document.getElementById('birthWarning');
const BIRTH_INPUT = FORM ? FORM.querySelector('input[name=\"birthDate\"]') : null;
const THEME_KEY = 'sajuTheme.v1';
const SOLAR_CACHE = new Map();
const SOLAR_STORAGE_KEY = 'sajuSolarTerms.v1';

hydrateSolarCache();

const nowUtcMs = Date.now();
TODAY_LABEL.textContent = `오늘 ${formatKstDate(nowUtcMs)} • ${getSexagenaryDay(nowUtcMs)} 일진 • ${getCurrentSolarTermLabel(nowUtcMs)}`;
initTheme();
initBirthInput();

FORM.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(FORM);
  const name = (data.get('name') || '').toString().trim();
  const birthDate = data.get('birthDate');
  const birthTime = data.get('birthTime');
  const gender = data.get('gender');
  const tone = data.get('tone') || 'balanced';

  if (!birthDate || !birthTime) return;

  const parsedBirth = parseBirthDate(birthDate.toString());
  if (!parsedBirth.valid) {
    showBirthWarning(parsedBirth.message);
    return;
  }
  showBirthWarning('');
  const { year, month, day } = parsedBirth;
  const [hour, minute] = birthTime.split(':').map(Number);
  const birthUtcMs = kstToUtcMs(year, month - 1, day, hour, minute || 0);

  const pillars = buildPillars(birthUtcMs);
  const todayStemBranch = getSexagenaryDay(nowUtcMs);
  const elementBalance = getElementBalance(pillars);

  RESULTS.innerHTML = renderResults({
    name,
    birthUtcMs,
    pillars,
    todayStemBranch,
    elementBalance,
    gender,
    tone
  });
  RESULTS.querySelectorAll('.card, .pillar-card, .fortune-card').forEach((el) => {
    el.classList.add('fade-in');
  });
  setupDownload();
});

if (THEME_TOGGLE) {
  THEME_TOGGLE.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-mode');
    THEME_TOGGLE.textContent = isDark ? '화이트 모드' : '다크 모드';
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  });
}

if (TERM_FORM) {
  TERM_FORM.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(TERM_FORM);
    const year = Number(data.get('testYear'));
    const termKey = data.get('testTerm');
    const reference = data.get('referenceTime');

    if (!year || !termKey) return;
    const terms = getSolarTermsForYear(year);
    const target = terms.find((term) => term.key === termKey);
    if (!target) return;

    const computedLabel = `${target.name} 계산값: ${formatKstDate(target.time)} ${formatKstTime(target.time)} KST`;
    let extra = '';

    if (reference) {
      const [datePart, timePart] = reference.split('T');
      const [refYear, refMonth, refDay] = datePart.split('-').map(Number);
      const [refHour, refMin] = timePart.split(':').map(Number);
      const refUtcMs = kstToUtcMs(refYear, refMonth - 1, refDay, refHour, refMin || 0);
      const diffMin = Math.round((target.time - refUtcMs) / 60000);
      const diffText = diffMin === 0
        ? '참고 시각과 동일합니다.'
        : `참고 시각 대비 ${Math.abs(diffMin)}분 ${diffMin > 0 ? '늦음' : '빠름'}.`;
      extra = `<br>차이: ${diffText}`;
    }

    const sanity = buildSanityMessage(target);
    TERM_RESULT.innerHTML = `${computedLabel}${extra}<br>${sanity}`;
  });
}

function kstToUtcMs(year, monthIndex, day, hour, minute) {
  return Date.UTC(year, monthIndex, day, hour, minute) - KST_OFFSET_MS;
}

function utcMsToKstDate(utcMs) {
  return new Date(utcMs + KST_OFFSET_MS);
}

function formatKstDate(utcMs) {
  const d = utcMsToKstDate(utcMs);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

function formatKstTime(utcMs) {
  const d = utcMsToKstDate(utcMs);
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDateKey(utcMs) {
  const d = utcMsToKstDate(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function formatLocalDateTime(utcMs) {
  const d = new Date(utcMs);
  return d.toLocaleString('ko-KR', { timeZoneName: 'short' });
}

function parseBirthDate(input) {
  const value = input.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return { valid: false, message: '생년월일은 YYYY-MM-DD 형식으로 입력해 주세요.' };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100) {
    return { valid: false, message: '연도는 1900~2100 범위로 입력해 주세요.' };
  }
  if (month < 1 || month > 12) {
    return { valid: false, message: '월은 01~12 범위로 입력해 주세요.' };
  }
  const maxDay = new Date(year, month, 0).getDate();
  if (day < 1 || day > maxDay) {
    return { valid: false, message: '일자는 해당 월의 유효한 날짜로 입력해 주세요.' };
  }
  return { valid: true, year, month, day };
}

function showBirthWarning(message) {
  if (!BIRTH_WARNING) return;
  BIRTH_WARNING.textContent = message;
}

function initTheme() {
  if (!THEME_TOGGLE) return;
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldDark = saved ? saved === 'dark' : prefersDark;
  document.body.classList.toggle('dark-mode', shouldDark);
  THEME_TOGGLE.textContent = shouldDark ? '화이트 모드' : '다크 모드';
}

function initBirthInput() {
  if (!BIRTH_INPUT) return;
  BIRTH_INPUT.addEventListener('input', () => {
    const raw = BIRTH_INPUT.value.replace(/\D/g, '').slice(0, 8);
    const parts = [];
    if (raw.length >= 4) {
      parts.push(raw.slice(0, 4));
      if (raw.length >= 6) {
        parts.push(raw.slice(4, 6));
        if (raw.length > 6) {
          parts.push(raw.slice(6, 8));
        }
      } else if (raw.length > 4) {
        parts.push(raw.slice(4));
      }
    } else {
      parts.push(raw);
    }
    BIRTH_INPUT.value = parts.join('-');
  });
}

function buildPillars(birthUtcMs) {
  const yearPillar = getYearPillar(birthUtcMs);
  const monthPillar = getMonthPillar(birthUtcMs, yearPillar.stemIndex);
  const dayPillar = getDayPillar(birthUtcMs);
  const hourPillar = getHourPillar(birthUtcMs, dayPillar.stemIndex);

  return [
    { label: '연주', ...yearPillar },
    { label: '월주', ...monthPillar },
    { label: '일주', ...dayPillar },
    { label: '시주', ...hourPillar }
  ];
}

function getYearPillar(utcMs) {
  const year = getSolarYear(utcMs);
  const baseYear = 1984; // 갑자년
  const offset = (year - baseYear + 60) % 60;
  const stemIndex = offset % 10;
  const branchIndex = offset % 12;
  return pillarFromIndex(stemIndex, branchIndex);
}

function getSolarYear(utcMs) {
  const kstDate = utcMsToKstDate(utcMs);
  const year = kstDate.getUTCFullYear();
  const ipchun = getSolarTermsForYear(year).find((term) => term.key === 'ipchun');
  if (!ipchun) return year;
  return utcMs < ipchun.time ? year - 1 : year;
}

function getMonthPillar(utcMs, yearStemIndex) {
  const monthIndex = getSolarMonthIndex(utcMs);
  const branchIndex = BRANCHES.indexOf(MONTH_BRANCHES[monthIndex]);
  const stemIndex = (yearStemIndex * 2 + monthIndex) % 10;
  return pillarFromIndex(stemIndex, branchIndex);
}

function getSolarMonthIndex(utcMs) {
  const kstDate = utcMsToKstDate(utcMs);
  const year = kstDate.getUTCFullYear();
  const thisYearTerms = getSolarTermsForYear(year);
  const prevYearTerms = getSolarTermsForYear(year - 1);
  const boundaries = [
    prevYearTerms.find((term) => term.key === 'daeseol'),
    ...thisYearTerms
  ].filter(Boolean);

  boundaries.sort((a, b) => a.time - b.time);
  let selected = boundaries[0];
  for (const boundary of boundaries) {
    if (utcMs >= boundary.time) {
      selected = boundary;
    } else {
      break;
    }
  }
  return selected.monthIndex;
}

function getCurrentSolarTermLabel(utcMs) {
  const kstDate = utcMsToKstDate(utcMs);
  const year = kstDate.getUTCFullYear();
  const terms = getSolarTermsForYear(year);
  const prevTerms = getSolarTermsForYear(year - 1);
  const boundaries = [
    prevTerms.find((term) => term.key === 'daeseol'),
    ...terms
  ].filter(Boolean);
  boundaries.sort((a, b) => a.time - b.time);

  let selected = boundaries[0];
  for (const boundary of boundaries) {
    if (utcMs >= boundary.time) {
      selected = boundary;
    } else {
      break;
    }
  }

  return `${selected.name} (${formatKstDate(selected.time)} ${formatKstTime(selected.time)} KST) 기준`;
}

function getDayPillar(utcMs) {
  const dayUtcMs = stripKstDateToUtcMs(utcMs);
  const diffDays = Math.floor((dayUtcMs - BASE_DAY_UTC_MS) / 86400000);
  const index = (diffDays % 60 + 60) % 60;
  const stemIndex = index % 10;
  const branchIndex = index % 12;
  return pillarFromIndex(stemIndex, branchIndex);
}

function getHourPillar(utcMs, dayStemIndex) {
  const kstDate = utcMsToKstDate(utcMs);
  const hour = kstDate.getUTCHours();
  const branchIndex = Math.floor(((hour + 1) % 24) / 2);
  const stemIndex = (dayStemIndex * 2 + branchIndex) % 10;
  return pillarFromIndex(stemIndex, branchIndex);
}

function stripKstDateToUtcMs(utcMs) {
  const kstDate = utcMsToKstDate(utcMs);
  return kstToUtcMs(
    kstDate.getUTCFullYear(),
    kstDate.getUTCMonth(),
    kstDate.getUTCDate(),
    0,
    0
  );
}

function pillarFromIndex(stemIndex, branchIndex) {
  const stem = STEMS[stemIndex];
  const branch = BRANCHES[branchIndex];
  return {
    stem,
    branch,
    stemIndex,
    branchIndex,
    element: ELEMENTS[stem]
  };
}

function getSexagenaryDay(utcMs) {
  const pillar = getDayPillar(utcMs);
  return `${pillar.stem}${pillar.branch}`;
}

function getElementBalance(pillars) {
  const balance = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  pillars.forEach((pillar) => {
    balance[pillar.element] += 1;
  });
  return balance;
}

function renderResults({ name, birthUtcMs, pillars, todayStemBranch, elementBalance, gender, tone }) {
  const dominant = getDominantElements(elementBalance);
  const guidance = buildGuidance(dominant, todayStemBranch, gender, tone, birthUtcMs);
  const termLabel = getCurrentSolarTermLabel(birthUtcMs);

  return `
    <div class="result-snapshot" id="resultSnapshot">
      <section class="card">
        <h2>${name ? `${name}님의 ` : ''}사주 개요</h2>
        <p>입력일시: ${formatKstDate(birthUtcMs)} ${formatKstTime(birthUtcMs)} · ${genderLabel(gender)} · ${termLabel}</p>
        <div class="result-grid">
          ${pillars.map(renderPillar).join('')}
        </div>
      </section>

      <section class="fortune-card">
        <h3>오늘의 종합 운세</h3>
        <p>${guidance.summary}</p>
        <div class="fortune-list">
          ${guidance.details.map((item) => `<div class="fortune-item"><strong>${item.title}</strong><br>${item.text}</div>`).join('')}
        </div>
      </section>

      <section class="card">
        <h2>시간 기준</h2>
        <div class="meta-grid">
          <div class="meta-item"><strong>현재 시각(브라우저)</strong><br>${formatLocalDateTime(nowUtcMs)}</div>
          <div class="meta-item"><strong>현재 시각(KST)</strong><br>${formatKstDate(nowUtcMs)} ${formatKstTime(nowUtcMs)}</div>
          <div class="meta-item"><strong>현재 시각(UTC)</strong><br>${new Date(nowUtcMs).toUTCString()}</div>
          <div class="meta-item"><strong>사주 계산 시각(KST)</strong><br>${formatKstDate(birthUtcMs)} ${formatKstTime(birthUtcMs)}</div>
          <div class="meta-item"><strong>사주 계산 시각(UTC)</strong><br>${new Date(birthUtcMs).toUTCString()}</div>
        </div>
      </section>

      <section class="card">
        <h2>오늘의 기운</h2>
        <p>오늘은 <strong>${todayStemBranch}</strong> 일진입니다. ${guidance.todayEnergy}</p>
        <div class="result-grid">
          ${dominant.map((el) => `<div class="pillar-card"><h3>${el} 기운</h3><p>${guidance.elementNotes[el]}</p></div>`).join('')}
        </div>
      </section>
    </div>

    <section class="card">
      <h2>결과 공유</h2>
      <div class="share-actions">
        <button type="button" class="button-secondary" id="downloadImage">결과 이미지 저장</button>
        <p class="share-note">이미지는 다운로드되어 앨범에서 공유할 수 있습니다.</p>
      </div>
      <div class="preview" id="imagePreview" hidden>
        <img alt="운세 결과 미리보기" />
      </div>
    </section>
  `;
}

function genderLabel(value) {
  if (value === 'female') return '여성';
  if (value === 'male') return '남성';
  if (value === 'other') return '기타/응답 안 함';
  return '선택 안 함';
}

function renderPillar(pillar) {
  const color = ELEMENT_COLORS[pillar.element];
  return `
    <article class="pillar-card">
      <h3>${pillar.label}</h3>
      <div class="pillar-value">${pillar.stem}${pillar.branch}</div>
      <span class="element-tag" style="color: ${color}; border: 1px solid ${color}33;">
        오행 ${pillar.element}
      </span>
      <p>${pillarMessage(pillar)}</p>
    </article>
  `;
}

function pillarMessage(pillar) {
  const messages = {
    목: '성장과 확장을 상징합니다. 오늘은 시작과 배움에 강점이 있습니다.',
    화: '열정과 표현이 도드라집니다. 대화와 피드백에서 기회를 얻기 좋습니다.',
    토: '안정과 책임이 강조됩니다. 일정 관리와 마무리에 힘을 주세요.',
    금: '정리와 결단이 돋보입니다. 불필요한 것을 덜어내기 좋습니다.',
    수: '유연함과 통찰이 돋보입니다. 흐름을 읽고 방향을 조정하세요.'
  };
  return messages[pillar.element];
}

function getDominantElements(balance) {
  const entries = Object.entries(balance);
  entries.sort((a, b) => b[1] - a[1]);
  const topScore = entries[0][1];
  return entries.filter(([_, value]) => value === topScore).map(([key]) => key);
}

function buildGuidance(dominantElements, todayStemBranch, gender, tone, birthUtcMs) {
  const elementNotes = {
    목: '계획의 씨앗이 자라기 시작하는 시기입니다. 작은 실험을 해보세요.',
    화: '사람과의 에너지가 올라갑니다. 발표, 협업, 네트워킹이 유리합니다.',
    토: '흐름을 정돈하는 힘이 필요합니다. 일과 생활의 균형을 잡아보세요.',
    금: '정리정돈과 기준 설정이 핵심입니다. 원칙을 지키면 성과가 납니다.',
    수: '정보 수집과 통찰이 유리합니다. 빠르게 움직이기보다 관찰하세요.'
  };

  const toneSet = {
    balanced: {
      summary: [
        `${dominantElements.join('·')} 기운이 안정적으로 밀어주는 날입니다. 오늘은 속도를 조절하며 핵심에 집중하면 성과가 깔끔하게 쌓입니다. 아침에는 우선순위를 정리하고, 오후에는 확실한 한 가지를 끝내는 흐름이 좋습니다. 무리한 확장보다 지금 가진 자원을 단단히 다지는 것이 이득입니다.<br><br>감정적으로는 들뜨기보다 차분함이 도움이 됩니다. 해야 할 일의 범위를 정하고, ‘오늘 끝낼 것’과 ‘미룰 것’을 구분해 두세요. 작은 실수를 줄이는 것만으로도 결과의 질이 달라집니다.<br><br>하루 마무리에는 정리 시간이 필요합니다. 계획을 짧게 회고하면 내일의 속도가 빨라지고, 오늘의 성과가 더 선명하게 남습니다.`,
        `${dominantElements.join('·')} 흐름이 또렷합니다. 오늘은 집중할 것과 미룰 것을 분리하면 효율이 높아집니다. 빠르게 처리할 일과 깊이 몰입할 일을 나누면 피로가 줄고 성과가 올라갑니다. 중요한 결정은 정보가 충분할 때 내리면 손해를 줄일 수 있습니다.<br><br>사람 관계에서는 명확한 일정과 합의가 도움이 됩니다. 말의 수를 줄이고 핵심만 전달하면 오해가 줄어듭니다. 감정적 대응보다 사실 정리가 유리합니다.<br><br>저녁에는 루틴을 지키는 편이 좋습니다. 리듬이 안정되면 다음 단계로 넘어가는 선택이 쉬워집니다.`,
        `${dominantElements.join('·')} 기운이 중심을 잡아줍니다. 오늘은 해야 할 것과 하지 말아야 할 것을 분명히 하면 하루가 간결해집니다. 작은 실수를 줄이는 것만으로도 흐름이 안정되고, 마무리의 질이 올라갑니다.<br><br>일의 구조를 먼저 정리하면 예상치 못한 변수에 흔들리지 않습니다. 일을 쪼개서 처리하고, 체크리스트를 활용하면 효율이 높아집니다.<br><br>관계에서는 기대치를 분명히 해두는 것이 좋습니다. 이해가 맞춰지면 일의 속도도 따라옵니다.`
      ],
      todayEnergy: [
        `현재 일진(${todayStemBranch})은 결단과 정돈의 흐름을 요구합니다. 중요한 선택은 오늘 안에 80% 확신이 들 때 실행하세요.`,
        `오늘 일진(${todayStemBranch})은 질서를 강조합니다. 우선순위를 확실히 하면 흐름이 정리됩니다.`
      ],
      details: {
        work: [
          '우선순위를 명확히 두고, 한 가지를 끝낸 뒤 다음으로 넘어가면 성과가 커집니다.',
          '업무 흐름을 단순화하면 집중력이 살아납니다.'
        ],
        money: [
          '충동구매를 피하고, 필요한 지출만 남기면 안정적인 흐름을 지킬 수 있습니다.',
          '지출 목록을 한 번만 정리해도 체감이 좋아집니다.'
        ],
        relation: [
          '짧고 명확한 메시지가 신뢰를 높입니다. 지나친 해석은 피하세요.',
          '정리된 표현이 오해를 줄이고 속도를 높입니다.'
        ],
        health: [
          '수면의 질이 컨디션을 좌우합니다. 오늘은 일찍 정리하는 편이 좋습니다.',
          '스트레칭과 수분 섭취만으로도 회복이 빠릅니다.'
        ],
        love: [
          '감정 표현은 충분히 하되, 상대의 속도를 존중하는 편이 좋습니다.',
          '가벼운 연락이 안정감을 키웁니다.'
        ],
        career: [
          '이직이나 포지션 이동은 조건을 문서로 확인한 뒤 결정하세요.',
          '조건 비교표를 만들어두면 판단이 쉬워집니다.'
        ],
        exam: [
          '정리 노트와 반복 학습이 성과를 높입니다. 단기 목표를 나누세요.',
          '오답 정리가 오늘 가장 큰 효율을 줍니다.'
        ],
        extraFemale: [
          '지지받는 대화가 행운을 부릅니다. 친밀한 사람과 계획을 공유하세요.',
          '가벼운 협업이 시너지를 만듭니다.'
        ],
        extraMale: [
          '책임을 과하게 지지 말고 도움을 요청하세요. 협업이 성과를 높입니다.',
          '요청을 미리 하면 일정이 안정됩니다.'
        ],
        extraOther: [
          '자신에게 편한 리듬을 우선시하면 오늘의 변수가 줄어듭니다.',
          '내 페이스를 지키는 것이 결과를 지켜줍니다.'
        ]
      }
    },
    warm: {
      summary: [
        `${dominantElements.join('·')} 기운이 포근하게 감싸는 날입니다. 오늘은 숨을 고르고 자신을 다독이는 것이 먼저입니다. 완벽을 요구하기보다 ‘가능한 만큼’의 리듬을 유지하면 마음과 결과가 동시에 안정됩니다. 작은 성취를 소중히 여기는 태도가 운을 키웁니다.<br><br>감정의 파동이 있을 수 있지만, 억지로 밀어붙이기보다 가볍게 다듬는 선택이 좋습니다. 할 수 있는 만큼을 해내고, 남은 것은 내일로 넘기는 여유가 필요합니다.<br><br>하루의 끝에는 자신을 칭찬해 주세요. 따뜻한 에너지가 내일의 추진력을 만들고, 관계에서도 안정감을 줍니다.`,
        `${dominantElements.join('·')} 기운이 따뜻하게 흐릅니다. 마음의 여유가 있을수록 운이 부드럽게 맞춰집니다. 급한 결정보다는 천천히 정리하는 선택이 더 오래 갑니다. 오늘은 자신을 돌보는 시간이 결국 성과로 이어집니다.<br><br>대화에서는 공감과 배려가 키워드입니다. 짧은 안부나 감사 표현이 관계의 온도를 올려줍니다. 작은 배려가 큰 운으로 돌아옵니다.<br><br>저녁에는 휴식을 충분히 갖는 편이 좋습니다. 몸이 쉬면 마음도 정리되고, 다음 계획이 자연스럽게 떠오릅니다.`
      ],
      todayEnergy: [
        `오늘 일진(${todayStemBranch})은 마음을 정리해 주는 에너지가 있습니다. 조급하지 않게, 따뜻한 리듬을 유지하세요.`,
        `일진(${todayStemBranch})이 안정감을 줍니다. 스스로를 다독이면 선택이 쉬워집니다.`
      ],
      details: {
        work: [
          '당장 완벽하지 않아도 괜찮습니다. 작은 성취를 쌓아가면 마음이 안정됩니다.',
          '조용히 정리해 나가면 흐름이 자연스럽게 좋아집니다.'
        ],
        money: [
          '필요한 것과 원하는 것을 구분하면 지출이 부드럽게 정리됩니다.',
          '작은 지출을 줄이면 여유가 생깁니다.'
        ],
        relation: [
          '감정을 짧게 표현해도 전달됩니다. 고맙다는 말 한마디가 운을 높여요.',
          '진심을 담은 한 문장이 관계를 부드럽게 합니다.'
        ],
        health: [
          '따뜻한 음식과 가벼운 스트레칭이 회복에 도움을 줍니다.',
          '짧은 휴식이 생각보다 큰 힘이 됩니다.'
        ],
        love: [
          '부담 없는 메시지 한 줄이 마음을 따뜻하게 합니다. 천천히 다가가세요.',
          '가벼운 공감이 관계를 깊게 합니다.'
        ],
        career: [
          '새로운 기회는 준비된 마음에서 시작됩니다. 작은 시도부터 해보세요.',
          '큰 결정보다 작은 선택이 흐름을 만듭니다.'
        ],
        exam: [
          '복습을 미루지 않으면 성과가 좋아집니다. 스스로를 응원해 주세요.',
          '정리한 것만 반복해도 충분히 성과가 납니다.'
        ],
        extraFemale: [
          '함께하는 대화가 운을 넓혀 줍니다. 편안한 사람과 시간을 나눠보세요.',
          '감정을 나누면 관계가 안정됩니다.'
        ],
        extraMale: [
          '혼자 해결하려 하기보다 도움을 나누면 오늘의 부담이 줄어듭니다.',
          '연락 한 번이 큰 힘이 됩니다.'
        ],
        extraOther: [
          '내 리듬을 존중하면 새로운 에너지가 자연스럽게 따라옵니다.',
          '편안함이 곧 추진력이 됩니다.'
        ]
      }
    },
    sharp: {
      summary: [
        `${dominantElements.join('·')} 기운이 뚜렷하게 드러나는 날입니다. 오늘은 미루지 말고 핵심부터 처리해야 결과가 나옵니다. 애매한 일을 지금 정리하세요. 확실한 것부터 끝내면 속도와 성과가 동시에 확보됩니다. 시간을 지키는 것이 곧 운을 지키는 날입니다.<br><br>선택을 미루면 비용이 늘어납니다. 과감하게 정리하고, 남길 것과 버릴 것을 분리하세요. 오늘은 ‘정리의 날’로 정하면 흐름이 빠르게 개선됩니다.<br><br>관계에서도 기준을 명확히 하세요. 애매한 합의는 되돌아옵니다. 분명한 합의가 곧 자유를 만들어 줍니다.`,
        `${dominantElements.join('·')} 흐름이 강하게 잡힙니다. 결정은 빠르게, 실행은 단호하게 하세요. 미룰수록 비용이 커지고, 정리할수록 길이 열립니다. 오늘은 ‘과감한 정리’가 가장 큰 이득입니다.<br><br>중요한 일부터 처리하세요. 작은 일에 매이지 말고, 핵심 하나를 끝내는 전략이 좋습니다. 의사결정은 최대한 간결하게 하세요.<br><br>피로 누적을 방치하지 마세요. 필요한 만큼 쉬어야 다음 속도가 나옵니다. 리듬을 지키는 것이 가장 큰 전략입니다.`
      ],
      todayEnergy: [
        `오늘 일진(${todayStemBranch})은 결단을 요구합니다. 애매하면 손해입니다. 우선순위를 확실히 정하세요.`,
        `일진(${todayStemBranch})은 속도전을 요구합니다. 중요한 것은 오늘 처리하세요.`
      ],
      details: {
        work: [
          '잡무 정리부터 끝내고 중요한 일에 집중하세요. 분산하면 손해입니다.',
          '핵심부터 처리하면 남은 일은 자동 정리됩니다.'
        ],
        money: [
          '불필요한 지출은 바로 끊으세요. 현금 흐름을 지키는 게 최우선입니다.',
          '지출 승인 기준을 오늘 세워두세요.'
        ],
        relation: [
          '돌려 말하지 말고 요점을 전달하세요. 명확함이 오해를 줄입니다.',
          '핵심만 말하면 불필요한 갈등이 줄어듭니다.'
        ],
        health: [
          '피로를 방치하면 크게 무너집니다. 휴식 시간을 확보하세요.',
          '회복이 먼저입니다. 뒤로 미루면 손해입니다.'
        ],
        love: [
          '감정은 솔직하게, 기준은 분명하게. 애매함을 정리하는 게 먼저입니다.',
          '관계를 흔드는 요소를 분리해서 보세요.'
        ],
        career: [
          '이직을 고민한다면 조건을 비교하고 결정을 미루지 마세요.',
          '기회는 유효기간이 있습니다. 판단을 늦추지 마세요.'
        ],
        exam: [
          '선택과 집중이 필요합니다. 약점 파트를 바로잡는 게 핵심입니다.',
          '실수 패턴을 차단하면 점수가 올라갑니다.'
        ],
        extraFemale: [
          '관계의 기준을 분명히 하면 불필요한 소모를 막을 수 있습니다.',
          '감정선은 짧게 정리하는 편이 낫습니다.'
        ],
        extraMale: [
          '무리한 책임감은 독이 됩니다. 필요한 지원을 요청하세요.',
          '역할을 분담해야 속도가 유지됩니다.'
        ],
        extraOther: [
          '원칙을 세우면 오늘의 변수가 줄어듭니다. 기준부터 세우세요.',
          '모호함을 줄일수록 결과가 나옵니다.'
        ]
      }
    }
  };

  const selectedTone = toneSet[tone] || toneSet.balanced;
  const seed = buildSeed(`${tone}-${todayStemBranch}-${birthUtcMs}`);

  const details = [
    { title: '일/학업', text: pickVariant(selectedTone.details.work, seed + 1) },
    { title: '재물', text: pickVariant(selectedTone.details.money, seed + 2) },
    { title: '관계', text: pickVariant(selectedTone.details.relation, seed + 3) },
    { title: '건강', text: pickVariant(selectedTone.details.health, seed + 4) },
    { title: '연애', text: pickVariant(selectedTone.details.love, seed + 5) },
    { title: '이직/커리어', text: pickVariant(selectedTone.details.career, seed + 6) },
    { title: '시험/자격', text: pickVariant(selectedTone.details.exam, seed + 7) }
  ];

  if (gender) {
    details.push({
      title: '추가 조언',
      text: gender === 'female'
        ? pickVariant(selectedTone.details.extraFemale, seed + 8)
        : gender === 'male'
          ? pickVariant(selectedTone.details.extraMale, seed + 9)
          : pickVariant(selectedTone.details.extraOther, seed + 10)
    });
  }

  return {
    summary: pickVariant(selectedTone.summary, seed + 11),
    details,
    todayEnergy: pickVariant(selectedTone.todayEnergy, seed + 12),
    elementNotes
  };
}

function buildSeed(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function pickVariant(list, seed) {
  if (!list || list.length === 0) return '';
  return list[seed % list.length];
}

function getSolarTermsForYear(year) {
  if (SOLAR_CACHE.has(year)) return SOLAR_CACHE.get(year);

  const terms = SOLAR_TERM_DEFS.map((term) => ({
    ...term,
    time: findSolarTermUtcMs(year, term)
  }));

  SOLAR_CACHE.set(year, terms);
  persistSolarCache();
  return terms;
}

function findSolarTermUtcMs(year, term) {
  const guessUtcMs = kstToUtcMs(year, term.guessMonth, term.guessDay, 12, 0);
  let windowMs = 6 * 86400000;
  let stepMs = 3 * 3600000;

  let bracket = findBracket(guessUtcMs - windowMs, guessUtcMs + windowMs, stepMs, term.longitude);
  if (!bracket) {
    windowMs = 10 * 86400000;
    stepMs = 6 * 3600000;
    bracket = findBracket(guessUtcMs - windowMs, guessUtcMs + windowMs, stepMs, term.longitude);
  }

  if (!bracket) return guessUtcMs;

  let [start, end] = bracket;
  for (let i = 0; i < 32; i += 1) {
    const mid = (start + end) / 2;
    const diffStart = angleDiff(solarLongitudeDeg(start), term.longitude);
    const diffMid = angleDiff(solarLongitudeDeg(mid), term.longitude);

    if (diffStart === 0) return start;
    if (diffMid === 0) return mid;

    if (diffStart * diffMid < 0) {
      end = mid;
    } else {
      start = mid;
    }
  }

  return (start + end) / 2;
}

function findBracket(start, end, step, targetLongitude) {
  let prevTime = start;
  let prevDiff = angleDiff(solarLongitudeDeg(prevTime), targetLongitude);

  for (let t = start + step; t <= end; t += step) {
    const diff = angleDiff(solarLongitudeDeg(t), targetLongitude);
    if (prevDiff === 0) return [prevTime, prevTime];
    if (diff === 0) return [t, t];
    if (prevDiff * diff < 0) {
      return [prevTime, t];
    }
    prevTime = t;
    prevDiff = diff;
  }
  return null;
}

function solarLongitudeDeg(utcMs) {
  const jd = utcMs / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  const l0 = normalizeAngle(280.46646 + 36000.76983 * t + 0.0003032 * t * t);
  const m = normalizeAngle(357.52911 + 35999.05029 * t - 0.0001537 * t * t);
  const c = (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(toRad(m))
    + (0.019993 - 0.000101 * t) * Math.sin(toRad(2 * m))
    + 0.000289 * Math.sin(toRad(3 * m));
  const trueLongitude = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLongitude - 0.00569 - 0.00478 * Math.sin(toRad(omega));
  return normalizeAngle(lambda);
}

function normalizeAngle(angle) {
  return (angle % 360 + 360) % 360;
}

function angleDiff(current, target) {
  return (current - target + 540) % 360 - 180;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function buildSanityMessage(term) {
  const expectedMonth = term.guessMonth + 1;
  const kstDate = utcMsToKstDate(term.time);
  const actualMonth = kstDate.getUTCMonth() + 1;
  const actualDay = kstDate.getUTCDate();
  const diff = Math.abs(actualMonth - expectedMonth);
  if (diff <= 1) {
    return `체크: ${actualMonth}월 ${actualDay}일로 계산되었습니다 (대략 ${expectedMonth}월 전후 범위 내).`;
  }
  return `주의: 예상 월(${expectedMonth}월)과 차이가 큽니다. 계산값을 다시 확인하세요.`;
}

function setupDownload() {
  const button = document.getElementById('downloadImage');
  const preview = document.getElementById('imagePreview');
  const previewImg = preview ? preview.querySelector('img') : null;

  if (!button || button.dataset.bound === 'true') return;
  button.dataset.bound = 'true';

  button.addEventListener('click', async () => {
    if (!window.html2canvas) {
      alert('이미지 생성 도구를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const target = document.getElementById('results');
    if (!target) return;

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = '이미지 생성 중...';

    try {
      document.body.classList.add('capture-mode');
      button.style.visibility = 'hidden';
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const rect = target.getBoundingClientRect();
      const scale = 1;
      const canvas = await window.html2canvas(target, {
        backgroundColor: '#ffffff',
        scale,
        useCORS: true,
        removeContainer: true,
        logging: false,
        foreignObjectRendering: true,
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight
      });
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      }
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `saju-today-${formatDateKey(Date.now())}.png`;
      link.click();

      if (preview && previewImg) {
        previewImg.src = dataUrl;
        preview.hidden = false;
      }
    } catch (error) {
      alert('이미지 생성에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      document.body.classList.remove('capture-mode');
      button.style.visibility = '';
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}

function hydrateSolarCache() {
  const raw = localStorage.getItem(SOLAR_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    Object.entries(parsed).forEach(([yearKey, terms]) => {
      if (!Array.isArray(terms)) return;
      const normalized = terms.map((term) => ({
        ...term,
        time: Number(term.time)
      })).filter((term) => Number.isFinite(term.time));
      SOLAR_CACHE.set(Number(yearKey), normalized);
    });
  } catch (error) {
    localStorage.removeItem(SOLAR_STORAGE_KEY);
  }
}

function persistSolarCache() {
  const payload = {};
  SOLAR_CACHE.forEach((terms, year) => {
    payload[year] = terms.map((term) => ({
      key: term.key,
      name: term.name,
      longitude: term.longitude,
      monthIndex: term.monthIndex,
      guessMonth: term.guessMonth,
      guessDay: term.guessDay,
      time: term.time
    }));
  });
  localStorage.setItem(SOLAR_STORAGE_KEY, JSON.stringify(payload));
}
