/* radar.habix.ai 데모 페이지 JS — index.html 에서 분리 (Round 2 monolith split, 2026-05-18) */

    /* Hold 계열 버블 색 (categoryRules.praise / .other 공용) */
    const HOLD_COLOR = "#9a9288";

    /**
     * 에러를 console + addLog(logArea) 로 표면화한다.
     * @param {string} context  어느 함수/작업에서 발생했는지
     * @param {Error}  error    catch 된 에러 객체
     */
    function reportError(context, error) {
      const msg = error?.message || String(error) || "알 수 없는 에러";
      console.error(`[radar] ${context}:`, error);
      // addLog 는 function 선언으로 호이스팅됨 → 호출 시점 무관하게 안전.
      addLog(`${context} 실패 — ${msg}`);
    }

    const fallbackInquiries = [
      { id: "inq-001", channel: "mock_kakao", segment: "Claude Code 첫 설치 수강생", message: "맥에서 설치하다가 zsh: command not found가 떠서 40분째 멈춰있어요. 강의는 좋은데 여기서 막히니까 시작도 못 하겠어요.", label_hint: "setup" },
      { id: "inq-010", channel: "mock_kakao", segment: "실습 중인 PM", message: "Claude가 만든 결과가 맞는지 틀린지 판단하는 기준을 모르겠어요. 좋은 결과물 예시와 나쁜 예시를 같이 보여주면 좋겠어요.", label_hint: "output_quality" },
      { id: "inq-025", channel: "mock_kakao", segment: "비개발 창업자", message: "AI가 파일을 고치는 건 봤는데, 이걸 사업 판단에 어떻게 써야 하는지 연결이 약하게 느껴졌어요.", label_hint: "concept_confusion" },
      { id: "inq-030", channel: "mock_kakao", segment: "수강생", message: "시각화 화면이 있으면 훨씬 이해가 빠를 것 같아요. 지금은 결과가 텍스트로만 나와서 임팩트가 덜합니다.", label_hint: "visualization" },
      { id: "inq-038", channel: "mock_channel_talk", segment: "수강생", message: "제 회사 데이터로 하려니 개인정보가 섞여 있어서 불안합니다. 익명화 프롬프트를 먼저 배우고 싶어요.", label_hint: "privacy" },
      { id: "inq-039", channel: "mock_kakao", segment: "예비 수강생", message: "강의 소개 페이지에서 완성 결과물을 먼저 보고 싶습니다. 뭘 만들게 되는지 보이면 결제할 것 같아요.", label_hint: "buying_trigger" },
      { id: "inq-049", channel: "mock_kakao", segment: "강의 팬", message: "와 이건 진짜 멋집니다. 그냥 툴 강의가 아니라 일하는 방식이 바뀌는 느낌이에요.", label_hint: "praise" }
    ];

    const categoryRules = {
      setup: {
        name: "설치 실패", color: "var(--red)", decisionType: "build", risk: 5,
        push: "첫 설치와 환경 차이에서 강의 시작 전 이탈이 발생",
        anxiety: "내 컴퓨터만 다른 것 같고 시작도 못 한다는 불안",
        decision: "OS별 복구 체크포인트와 에러북을 먼저 만든다",
        reply: "사용 중인 OS와 에러 문구를 확인한 뒤, 해당 체크포인트부터 안내하겠습니다.",
        hold: "운영자 확인 없는 원격 디버깅 자동화"
      },
      practice_blocker: {
        name: "반복 막힘", color: "var(--red)", decisionType: "build", risk: 5,
        push: "실습 중 같은 질문이 반복되고 운영자가 수동 답변을 반복",
        anxiety: "어디서부터 다시 해야 할지 몰라 흐름이 끊김",
        decision: "체크포인트별 복구 파일과 에러 리포트 템플릿을 만든다",
        reply: "지금 막힌 단계와 화면 캡처를 기준으로 복구 체크포인트를 안내하겠습니다.",
        hold: "모든 질문을 일반 FAQ로만 처리"
      },
      concept_confusion: {
        name: "PM 사고 연결", color: "var(--red)", decisionType: "build", risk: 4,
        push: "도구 사용법과 PM 판단 사이의 연결이 약하게 느껴짐",
        anxiety: "멋진 기술을 봐도 PM 역량으로 남지 않을 수 있음",
        decision: "각 실습 앞에 PM 개념 카드와 hplan Gate 장면을 배치한다",
        reply: "이 문의는 기능 문제가 아니라 PM 판단 연결 문제로 보고 보강하겠습니다.",
        hold: "CLI 기능 설명만 더 늘리기"
      },
      output_quality: {
        name: "품질판단", color: "var(--red)", decisionType: "build", risk: 4,
        push: "AI 산출물은 나오지만 승인 기준이 없음",
        anxiety: "틀린 결과를 그대로 업무에 쓸까 봐 불안",
        decision: "good/bad 예시와 채점 루브릭을 추가한다",
        reply: "좋은 결과와 위험한 결과를 나눠 볼 수 있는 루브릭 예시를 함께 드리겠습니다.",
        hold: "예쁜 결과물 갤러리만 추가"
      },
      visualization: {
        name: "시각화 니즈", color: "var(--yellow)", decisionType: "interview", risk: 3,
        push: "텍스트 결과만으로는 강의 임팩트와 공유성이 약함",
        anxiety: "동료나 이해관계자에게 설명하기 어려움",
        decision: "공유 가능한 PMF Radar와 evidence flow를 실습 결과물로 만든다",
        reply: "문의 묶음이 어떤 제품 판단으로 바뀌는지 시각화 예시를 먼저 보여드리겠습니다.",
        hold: "테이블 컬럼만 늘린 대시보드"
      },
      privacy: {
        name: "개인정보", color: "var(--green)", decisionType: "guardrail", risk: 5,
        push: "실제 상담 데이터를 쓰고 싶지만 개인정보가 장벽",
        anxiety: "회사 데이터 유출과 보안 규정 위반",
        decision: "익명화 루틴과 발송 전 human review 정책을 먼저 둔다",
        reply: "실데이터 사용 전에는 익명화 샘플과 보관/삭제 기준부터 확인하겠습니다.",
        hold: "개인정보가 섞인 원문을 분석 엔진에 바로 전송"
      },
      refund_price: {
        name: "구매 불안", color: "var(--yellow)", decisionType: "interview", risk: 4,
        push: "구매 전 난이도와 결과물이 상상되지 않음",
        anxiety: "가격 대비 내 업무에 남는 것이 없을 수 있음",
        decision: "완성 결과물, 난이도 비교, 설치 없는 체험 경로를 먼저 보여준다",
        reply: "구매 전 확인할 수 있는 결과물 샘플과 난이도 기준을 먼저 안내드리겠습니다.",
        hold: "가격 할인만으로 불안 해소"
      },
      buying_trigger: {
        name: "구매 트리거", color: "var(--yellow)", decisionType: "interview", risk: 3,
        push: "내 상황에 맞는 적용 사례가 보이면 결제 의지가 생김",
        anxiety: "내 업무에 그대로 적용될지 확신 부족",
        decision: "업무별 적용 사례와 3분 데모 영상을 랜딩에 둔다",
        reply: "요청하신 업무 맥락에 맞춘 샘플 결과물을 먼저 보여드리겠습니다.",
        hold: "범용 AI 자동화라고 넓게만 말하기"
      },
      retention: {
        name: "재방문/재수강", color: "var(--yellow)", decisionType: "interview", risk: 3,
        push: "업데이트와 반복 활용 기대가 있으나 체계가 부족함",
        anxiety: "버전 변경이나 업무 적용 실패로 다시 쓰지 않을 수 있음",
        decision: "업무별 starter kit와 업데이트 알림 루틴을 검증한다",
        reply: "업데이트 기준과 다시 적용할 수 있는 starter kit 방향을 확인하겠습니다.",
        hold: "모든 업무 템플릿을 한 번에 제작"
      },
      praise: {
        name: "칭찬", color: HOLD_COLOR, decisionType: "hold", risk: 1,
        push: "감탄은 있으나 반복 행동은 아직 없음",
        anxiety: "후기와 제품 증거를 혼동할 수 있음",
        decision: "후기 후보로 보관하고 build evidence로 과대해석하지 않는다",
        reply: "좋게 봐주셔서 감사합니다. 어떤 장면이 가장 도움이 됐는지도 확인하겠습니다.",
        hold: "칭찬만 보고 기능 우선순위 결정"
      },
      other: {
        name: "기타 신호", color: HOLD_COLOR, decisionType: "hold", risk: 2,
        push: "아직 PMF evidence로 쓰기에는 맥락이 부족함",
        anxiety: "막연한 의견을 제품 요구사항으로 오해할 수 있음",
        decision: "추가 인터뷰 전까지 보관한다",
        reply: "맥락을 조금 더 확인한 뒤 제품 개선 후보로 분류하겠습니다.",
        hold: "맥락 없는 단일 의견을 바로 개발"
      }
    };

    const state = {
      inquiries: [],
      signals: [],
      gptSignals: [],
      gptBacklog: [],
      pendingFileRecords: [],
      clusters: [],
      filter: "all",
      mode: "local",
      apiReady: false,
      apiModel: "-",
      selectedCluster: 0,
      reviewStatus: new Map()
    };

    const svg = document.getElementById("evidenceMap");
    const quoteText = document.getElementById("quoteText");
    const quoteMeta = document.getElementById("quoteMeta");
    const pushText = document.getElementById("pushText");
    const anxietyText = document.getElementById("anxietyText");
    const decisionText = document.getElementById("decisionText");
    const replyText = document.getElementById("replyText");
    const notNowText = document.getElementById("notNowText");
    const stageNodes = [...document.querySelectorAll("[data-stage]")];
    const workflowRail = document.getElementById("workflowRail");
    const runLog = document.getElementById("runLog");

    function addLog(message) {
      const now = new Date();
      const line = document.createElement("div");
      line.className = "log-line";
      line.innerHTML = `<time>${now.toLocaleTimeString("ko-KR", { hour12: false })}</time><span>${message}</span>`;
      runLog.prepend(line);
    }

    function setWorkflowStage(stage, message) {
      const maxStage = Math.max(1, stageNodes.length - 1);
      workflowRail.style.setProperty("--progress", `${Math.min(100, Math.max(0, stage * (100 / maxStage)))}%`);
      stageNodes.forEach((node, index) => {
        node.classList.toggle("done", index < stage);
        node.classList.toggle("active", index === stage);
      });
      if (message) addLog(message);
    }

    function setRunMeta({ engine, records, latency, gate } = {}) {
      if (engine) document.getElementById("engineState").textContent = engine;
      if (records !== undefined) document.getElementById("runRecords").textContent = records;
      if (latency !== undefined) document.getElementById("runLatency").textContent = latency;
      if (gate) document.getElementById("runGate").textContent = gate;
    }

    function normalizeChannel(channel = "") {
      const text = channel.toLowerCase();
      if (text.includes("channel_talk") || text.includes("채널톡")) return "channel_talk";
      if (text.includes("open") || text.includes("오픈")) return "openchat";
      if (text.includes("csv") || text.includes("manual")) return "manual";
      if (text.includes("kakao") || text.includes("카카오")) return "kakao";
      return "manual";
    }

    function inferCategory(item) {
      if (item.label_hint && categoryRules[item.label_hint]) return item.label_hint;
      const message = item.message || item.raw_message || "";
      if (/개인정보|법무|보안|삭제|보관/.test(message)) return "privacy";
      if (/설치|npm|zsh|윈도우|맥|터미널/.test(message)) return "setup";
      if (/환불|가격|결제|구매 전|고민/.test(message)) return "refund_price";
      if (/시각화|대시보드|지도|흐름도|차트/.test(message)) return "visualization";
      if (/기준|루브릭|품질|맞는지|틀린지|평가/.test(message)) return "output_quality";
      if (/PMF|JTBD|PM 사고|사업 판단|hplan/.test(message)) return "concept_confusion";
      if (/반복|막히|에러|복구|질문/.test(message)) return "practice_blocker";
      if (/결제|사례|데모|보고 싶/.test(message)) return "buying_trigger";
      if (/재수강|업데이트|다시|starter|스타터/.test(message)) return "retention";
      if (/멋지|신기|좋았|와 /.test(message)) return "praise";
      return "other";
    }

    function evidenceStrength(item, rule) {
      const message = item.message || item.raw_message || "";
      if (rule.risk >= 5 || /환불|40분|법무|개인정보|결제|이탈|막히/.test(message)) return "strong";
      if (rule.risk >= 3 || message.length > 34) return "medium";
      return "weak";
    }

    function priorityOf(rule, strength) {
      const add = strength === "strong" ? 0 : strength === "medium" ? -1 : -2;
      return Math.max(1, Math.min(5, rule.risk + add));
    }

    function toSignal(item, index) {
      if (item && item.__signal) return item.__signal;
      const category = inferCategory(item);
      const rule = categoryRules[category] || categoryRules.other;
      const strength = evidenceStrength(item, rule);
      const channel = normalizeChannel(item.channel || item.source || "");
      const segment = item.segment || item.customer_segment || "manual import";
      const raw = item.message || item.raw_message || "";
      return {
        id: item.id || `manual-${index + 1}`,
        channel,
        segment,
        raw,
        category,
        clusterName: rule.name,
        strength,
        priority: priorityOf(rule, strength),
        decisionType: rule.decisionType,
        push: rule.push,
        anxiety: rule.anxiety,
        decision: rule.decision,
        reply: rule.reply,
        hold: rule.hold,
        workaround: "수동 문의 확인 또는 운영자 반복 답변",
        trigger: "반복 문의, 구매/이탈 표현, 업무 적용 의지가 보일 때",
        evidence_reason: `${strength} evidence by local rule`
      };
    }

    function parseManualImport(text) {
      const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      return lines.map((line, index) => {
        const match = line.match(/^\[([^\]]+)\]\s*([^:：]+)[:：]\s*(.+)$/);
        if (match) {
          return {
            id: `manual-${Date.now()}-${index}`,
            channel: match[1],
            segment: match[2].trim(),
            message: match[3].trim()
          };
        }
        return {
          id: `manual-${Date.now()}-${index}`,
          channel: "manual_csv",
          segment: "manual import",
          message: line.replace(/^"|"$/g, "")
        };
      });
    }

    function parseCsvText(text) {
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return [];
      const headers = lines[0].split(",").map((h) => h.trim());
      return lines.slice(1).map((line, index) => {
        const values = line.match(/("([^"]|"")*"|[^,]+)/g) || [];
        const row = Object.fromEntries(headers.map((header, i) => [header, (values[i] || "").replace(/^"|"$/g, "").replace(/""/g, '"').trim()]));
        return {
          id: row.id || row.message_id || `csv-${Date.now()}-${index}`,
          channel: row.channel || row.source || "manual_csv",
          segment: row.segment || row.customer_segment || "csv import",
          message: row.message || row.text || ""
        };
      }).filter((row) => row.message);
    }

    function parseJsonRecords(text) {
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : data.sample_inquiries || data.records || data.messages || data.normalized_messages || [];
      return items.map((item, index) => ({
        id: item.id || item.message_id || `json-${Date.now()}-${index}`,
        channel: item.channel || item.source || "manual_import",
        segment: item.segment || item.customer_segment || "json import",
        message: item.message || item.text || item.raw || ""
      })).filter((row) => row.message);
    }

    async function readImportFile(file) {
      const text = await file.text();
      if (file.name.endsWith(".json") || file.type.includes("json")) return parseJsonRecords(text);
      return parseCsvText(text);
    }

    function filteredSignals() {
      if (state.filter === "all") return state.signals;
      if (state.filter === "kakao") return state.signals.filter((signal) => signal.channel === "kakao" || signal.channel === "openchat");
      if (state.filter === "manual") return state.signals.filter((signal) => signal.channel === "manual");
      return state.signals.filter((signal) => signal.channel === state.filter);
    }

    function buildClusters() {
      const grouped = new Map();
      filteredSignals().forEach((signal) => {
        const rule = categoryRules[signal.category] || categoryRules.other;
        if (!grouped.has(signal.category)) {
          grouped.set(signal.category, {
            category: signal.category,
            name: signal.clusterName,
            color: rule.color,
            decisionType: signal.decisionType,
            signals: [],
            strong: 0,
            riskTotal: 0
          });
        }
        const cluster = grouped.get(signal.category);
        cluster.signals.push(signal);
        cluster.strong += signal.strength === "strong" ? 1 : 0;
        cluster.riskTotal += signal.priority;
      });

      const clusters = [...grouped.values()].sort((a, b) => {
        const scoreA = a.signals.length * 10 + a.strong * 6 + a.riskTotal;
        const scoreB = b.signals.length * 10 + b.strong * 6 + b.riskTotal;
        return scoreB - scoreA;
      });

      const total = clusters.length;
      return clusters.map((cluster, index) => {
        const risk = cluster.riskTotal / cluster.signals.length;
        const x = total <= 4
          ? 130 + index * (total === 1 ? 0 : 540 / (total - 1))
          : 90 + index * (660 / Math.max(1, total - 1));
        const y = 350 - risk * 58 + (index % 3) * 16;
        return {
          ...cluster,
          x: Math.max(80, Math.min(680, x)),
          y: Math.max(82, Math.min(318, y)),
          r: Math.max(22, Math.min(52, 18 + cluster.signals.length * 3 + cluster.strong * 5))
        };
      });
    }

    function shortLabel(text) {
      return text.length > 11 ? `${text.slice(0, 10)}…` : text;
    }

    function renderMap() {
      svg.querySelectorAll(".bubble").forEach((node) => node.remove());
      state.clusters.forEach((cluster, index) => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", `bubble ${index === state.selectedCluster ? "active" : ""}`);
        g.setAttribute("opacity", index === state.selectedCluster ? "1" : ".82");
        g.setAttribute("role", "button");
        g.setAttribute("tabindex", "0");
        g.setAttribute("aria-label", `${cluster.name} 신호 선택`);
        g.innerHTML = `
          <circle cx="${cluster.x}" cy="${cluster.y}" r="${cluster.r}" fill="${cluster.color}"></circle>
          <text x="${cluster.x}" y="${cluster.y + cluster.r + 20}" text-anchor="middle">${shortLabel(cluster.name)}</text>
        `;
        g.addEventListener("click", () => selectCluster(index));
        g.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectCluster(index);
          }
        });
        svg.appendChild(g);
      });
    }

    function selectCluster(index) {
      state.selectedCluster = Math.max(0, Math.min(index, state.clusters.length - 1));
      const cluster = state.clusters[state.selectedCluster];
      if (!cluster) return;
      const signal = cluster.signals.find((item) => item.strength === "strong") || cluster.signals[0];
      quoteText.textContent = `"${signal.raw}"`;
      quoteMeta.textContent = `${signal.strength} · ${signal.channel} · ${cluster.signals.length}건`;
      pushText.textContent = signal.push;
      anxietyText.textContent = signal.anxiety;
      decisionText.textContent = signal.decision;
      replyText.textContent = signal.reply;
      notNowText.textContent = signal.hold;
      [...svg.querySelectorAll(".bubble")].forEach((node, i) => {
        node.classList.toggle("active", i === state.selectedCluster);
        node.setAttribute("opacity", i === state.selectedCluster ? "1" : ".82");
      });
      renderReviewAndBacklog();
      renderExport();
    }

    function renderMetrics() {
      const counts = {
        kakao: state.signals.filter((s) => s.channel === "kakao").length,
        channel_talk: state.signals.filter((s) => s.channel === "channel_talk").length,
        openchat: state.signals.filter((s) => s.channel === "openchat").length,
        manual: state.signals.filter((s) => s.channel === "manual").length
      };
      document.getElementById("metricInquiries").textContent = "INPUT";
      document.getElementById("metricChannels").textContent = "MASK";
      document.getElementById("metricClusters").textContent = "ROUTE";
      document.getElementById("metricBuild").textContent = "PLAN";
      document.getElementById("classificationMode").textContent = state.mode === "gpt" ? "hplan 분석 결과" : "로컬 기준 분석";
      document.getElementById("modelMetric").textContent = `${state.clusters.filter((c) => c.decisionType === "build").length}개 개선 후보`;
      document.getElementById("countKakao").textContent = counts.kakao;
      document.getElementById("countChannelTalk").textContent = counts.channel_talk;
      document.getElementById("countOpenChat").textContent = counts.openchat;
      document.getElementById("countManual").textContent = counts.manual;
      document.getElementById("activeFilter").textContent = `filter: ${state.filter}`;
    }

    function renderReviewAndBacklog() {
      const reviewList = document.getElementById("reviewList");
      const backlogList = document.getElementById("backlogList");
      const holdList = document.getElementById("holdList");
      const topSignals = filteredSignals()
        .filter((signal) => signal.decisionType !== "hold")
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 5);
      reviewList.innerHTML = topSignals.map((signal) => {
        const status = state.reviewStatus.get(signal.id) || "pending";
        const draft = signal.replyEdited || signal.reply;
        return `
          <article class="review-item" data-review-id="${signal.id}">
            <b>${signal.segment}</b>
            <p>${draft}</p>
            <textarea class="review-edit" data-draft-id="${signal.id}">${draft}</textarea>
            <div class="review-actions inline">
              <button class="mini-btn secondary" data-save-draft="${signal.id}">저장</button>
              <button class="mini-btn" data-approve-draft="${signal.id}">승인</button>
              <button class="mini-btn secondary" data-escalate-draft="${signal.id}">검토</button>
            </div>
            <div class="status-line"><span>${signal.channel} · ${signal.strength}</span><span>${status}</span></div>
          </article>
        `;
      }).join("");
      reviewList.querySelectorAll("[data-save-draft]").forEach((button) => button.addEventListener("click", () => {
        const id = button.dataset.saveDraft;
        const signal = state.signals.find((item) => item.id === id);
        const input = reviewList.querySelector(`[data-draft-id="${CSS.escape(id)}"]`);
        if (signal && input) signal.replyEdited = input.value;
        state.reviewStatus.set(id, "edited");
        renderReviewAndBacklog();
        renderExport();
      }));
      reviewList.querySelectorAll("[data-approve-draft]").forEach((button) => button.addEventListener("click", () => {
        state.reviewStatus.set(button.dataset.approveDraft, "approved");
        renderReviewAndBacklog();
        renderExport();
      }));
      reviewList.querySelectorAll("[data-escalate-draft]").forEach((button) => button.addEventListener("click", () => {
        state.reviewStatus.set(button.dataset.escalateDraft, "needs human review");
        renderReviewAndBacklog();
        renderExport();
      }));
      document.getElementById("reviewCount").textContent = `${topSignals.filter((s) => (state.reviewStatus.get(s.id) || "pending") === "pending").length} pending`;

      const backlog = state.gptBacklog.length && state.mode === "gpt"
        ? state.gptBacklog.filter((item) => item.decisionType !== "hold").slice(0, 5)
        : state.clusters.filter((cluster) => cluster.decisionType !== "hold").slice(0, 5);
      backlogList.innerHTML = backlog.map((cluster) => {
        const sample = cluster.signals ? cluster.signals[0] : cluster;
        return `
          <article class="backlog-item">
            <b>${cluster.decisionType.toUpperCase()} · ${cluster.name || cluster.title}</b>
            <p>${sample.decision || sample.next_action}</p>
            <div class="status-line"><span>${cluster.signals ? `${cluster.signals.length} signals` : "hplan backlog"}</span><span>${cluster.strong || sample.why || "review"}</span></div>
          </article>
        `;
      }).join("");
      document.getElementById("backlogCount").textContent = `${backlog.length} items`;

      const holds = state.clusters.map((cluster) => cluster.signals[0]).filter(Boolean).slice(0, 4);
      holdList.innerHTML = holds.map((signal) => `
        <article class="backlog-item">
          <b>${signal.clusterName}</b>
          <p>${signal.hold}</p>
        </article>
      `).join("");
    }

    function renderExport() {
      const backlog = state.clusters.filter((cluster) => cluster.decisionType !== "hold").slice(0, 5);
      const lines = [
        "# PMF Signal Radar Export",
        "",
        `- source filter: ${state.filter}`,
        `- classifier: ${state.mode === "gpt" ? "AI structured classifier" : "local fallback"}`,
        `- analyzed inquiries: ${state.signals.length}`,
        `- visible clusters: ${state.clusters.length}`,
        "",
        "## Evidence-backed backlog",
        ...backlog.flatMap((cluster, index) => [
          `${index + 1}. ${cluster.decisionType.toUpperCase()} · ${cluster.name}`,
          `   - evidence: ${cluster.signals.length} signals / ${cluster.strong} strong`,
          `   - hplan decision: ${cluster.signals[0].decision}`,
          `   - not now: ${cluster.signals[0].hold}`
        ]),
        "",
        "## Human review queue",
        ...filteredSignals().filter((signal) => signal.decisionType !== "hold").slice(0, 5).map((signal) => `- [${state.reviewStatus.get(signal.id) || "pending"}] ${signal.segment}: ${signal.replyEdited || signal.reply}`)
      ];
      document.getElementById("markdownExport").value = lines.join("\n");
    }

    function renderAll() {
      state.signals = state.mode === "gpt" && state.gptSignals.length ? state.gptSignals : state.inquiries.map(toSignal);
      state.clusters = buildClusters();
      state.selectedCluster = Math.min(state.selectedCluster, Math.max(0, state.clusters.length - 1));
      renderMetrics();
      renderMap();
      selectCluster(state.selectedCluster);
    }

    function mapApiSignal(signal, index) {
      const category = categoryRules[signal.category] ? signal.category : "other";
      const rule = categoryRules[category];
      return {
        id: signal.id || `hplan-${index + 1}`,
        channel: normalizeChannel(signal.channel),
        segment: signal.segment || "hplan classified",
        raw: signal.raw || "",
        category,
        clusterName: shortLabel(signal.clusterName || rule.name),
        strength: ["strong", "medium", "weak"].includes(signal.strength) ? signal.strength : "medium",
        priority: Math.max(1, Math.min(5, Number(signal.priority) || 3)),
        decisionType: ["build", "interview", "guardrail", "hold"].includes(signal.decisionType) ? signal.decisionType : rule.decisionType,
        push: signal.push || rule.push,
        anxiety: signal.anxiety || rule.anxiety,
        workaround: signal.workaround || "운영자가 수동으로 맥락을 확인",
        trigger: signal.trigger || "반복 또는 구매/이탈 표현",
        decision: signal.decision || rule.decision,
        reply: signal.reply || rule.reply,
        hold: signal.hold || rule.hold,
        evidence_reason: signal.evidence_reason || "hplan structured evidence",
        __signal: true
      };
    }

    function collectImportRecords() {
      const imported = parseManualImport(document.getElementById("manualImport").value);
      return [...imported, ...state.pendingFileRecords];
    }

    async function runGptClassification() {
      const imported = collectImportRecords();
      const existingIds = new Set(state.inquiries.map((item) => item.id));
      const fresh = imported.filter((item) => !existingIds.has(item.id));
      if (fresh.length) state.inquiries = [...state.inquiries, ...fresh];
      const records = (imported.length ? imported : state.inquiries.slice(-12)).slice(0, 18);
      setWorkflowStage(0, `${records.length}개 문의를 hplan 분석 대상으로 준비했습니다.`);
      setRunMeta({ engine: "hplan 분석 엔진", records: records.length, latency: "running", gate: "evidence" });
      try {
        setWorkflowStage(1, "adapter schema 기준으로 source/segment/message를 정규화합니다.");
        await new Promise((resolve) => setTimeout(resolve, 160));
        setWorkflowStage(2, "PII mask preview 후 서버 분석 엔진으로 전송합니다.");
        const started = performance.now();
        setWorkflowStage(3, "문의 의도와 Push, Anxiety, Workaround, Trigger를 구조화하고 있습니다.");
        const response = await fetch("/api/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records })
        });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || data.detail || "classification failed");
        state.mode = "gpt";
        state.apiModel = data.run_summary?.model || state.apiModel;
        state.gptSignals = (data.signals || []).map(mapApiSignal);
        state.gptBacklog = data.backlog || [];
        state.selectedCluster = 0;
        setWorkflowStage(4, `${state.gptSignals.length}개 evidence를 답변 초안 또는 운영자 검토로 분기했습니다.`);
        await new Promise((resolve) => setTimeout(resolve, 160));
        setWorkflowStage(5, "반복 불편을 PMF Radar와 hplan Backlog에 적재했습니다.");
        setRunMeta({
          engine: "hplan 분석 엔진",
          records: state.gptSignals.length,
          latency: `${data.run_summary?.latency_ms || Math.round(performance.now() - started)}ms`,
          gate: data.run_summary?.hplan_gate || "evidence"
        });
        renderAll();
      } catch (error) {
        state.mode = "local";
        state.gptSignals = [];
        setWorkflowStage(5, `서버 분석 실패: ${error.message}. 로컬 기준으로 갱신했습니다.`);
        setRunMeta({ engine: "로컬 기준 분석", latency: "fallback", gate: "evidence" });
        renderAll();
      }
    }

    async function checkApiHealth() {
      try {
        const response = await fetch("/api/health");
        const data = await response.json();
        state.apiReady = Boolean(data.openai_key);
        state.apiModel = data.model || "-";
        const status = document.getElementById("apiStatus");
        status.textContent = state.apiReady ? "분석 가능" : "서버 연결 필요";
        status.classList.toggle("ready", state.apiReady);
        status.classList.toggle("error", !state.apiReady);
        document.getElementById("modelName").textContent = state.apiReady ? "분석 엔진 준비" : "로컬 기준만 사용";
        document.getElementById("modelMetric").textContent = state.apiReady ? "Radar → hplan 개선 후보" : "서버 연결 필요";
        addLog(state.apiReady ? "서버 분석 엔진 연결 준비 완료" : "분석 키가 없어 로컬 기준만 사용합니다.");
      } catch (error) {
        const status = document.getElementById("apiStatus");
        status.textContent = "static server";
        status.classList.add("error");
        addLog("API 서버가 아니라 정적 서버로 열려 있습니다. server.py로 실행해야 서버 분석이 동작합니다.");
      }
    }

    async function loadInitialData() {
      try {
        const response = await fetch("../data/sample_inquiries.json");
        if (!response.ok) throw new Error(`sample fetch failed (HTTP ${response.status})`);
        state.inquiries = await response.json();
      } catch (error) {
        reportError("loadInitialData", error);
        state.inquiries = fallbackInquiries;
      }
      renderAll();
    }

    async function loadFixtureData() {
      const paths = ["../data/kakao_consultalk_channel_fixture.json", "../data/channel_talk_fixture.json"];
      const records = [];
      for (const path of paths) {
        try {
          const response = await fetch(path);
          if (!response.ok) continue;
          const data = await response.json();
          const items = Array.isArray(data) ? data : data.sample_inquiries || data.events || data.messages || data.records || data.normalized_messages || [];
          items.forEach((item, index) => records.push({
            id: item.id || item.event_id || item.message_id || `fixture-${records.length + index}`,
            channel: item.channel || item.source || item.platform || path,
            segment: item.segment || item.customer_segment || item.sender_type || "fixture user",
            message: item.message || item.text || item.content || item.body || ""
          }));
        } catch (error) {
          reportError(`loadFixtureData(${path})`, error);
        }
      }
      if (records.length) {
        state.inquiries = [...state.inquiries, ...records.filter((item) => item.message)];
      } else {
        state.inquiries = [...state.inquiries, ...parseManualImport(document.getElementById("manualImport").value)];
      }
      state.selectedCluster = 0;
      state.mode = "local";
      state.gptSignals = [];
      renderAll();
    }

    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-filter]").forEach((node) => node.classList.remove("active"));
        button.classList.add("active");
        state.filter = button.dataset.filter;
        state.selectedCluster = 0;
        state.clusters = buildClusters();
        renderAll();
      });
    });

    document.getElementById("processImport").addEventListener("click", runGptClassification);
    document.getElementById("localRefresh").addEventListener("click", () => {
      const imported = collectImportRecords();
      state.inquiries = [...state.inquiries, ...imported];
      state.selectedCluster = 0;
      state.mode = "local";
      state.gptSignals = [];
      setWorkflowStage(5, `${imported.length}개 import record를 로컬 기준으로 갱신했습니다.`);
      renderAll();
    });
    document.getElementById("fileImport").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        state.pendingFileRecords = await readImportFile(file);
        addLog(`${file.name}에서 ${state.pendingFileRecords.length}개 record를 읽었습니다.`);
      } catch (error) {
        addLog(`파일 import 실패: ${error.message}`);
      }
    });
    document.getElementById("loadSampleCsv").addEventListener("click", async () => {
      try {
        const response = await fetch("../data/manual_import_sample.csv");
        if (!response.ok) throw new Error(`CSV fetch 실패 (HTTP ${response.status})`);
        const csv = await response.text();
        state.pendingFileRecords = parseCsvText(csv);
        addLog(`manual_import_sample.csv에서 ${state.pendingFileRecords.length}개 record를 불러왔습니다.`);
      } catch (error) {
        reportError("loadSampleCsv", error);
      }
    });
    document.getElementById("loadWebhookInbox").addEventListener("click", async () => {
      try {
        const response = await fetch("/api/webhooks/inbox");
        if (!response.ok) throw new Error(`webhook inbox fetch 실패 (HTTP ${response.status})`);
        const data = await response.json();
        state.pendingFileRecords = data.records || [];
        addLog(`webhook inbox에서 ${state.pendingFileRecords.length}개 record를 불러왔습니다.`);
      } catch (error) {
        reportError("loadWebhookInbox", error);
      }
    });
    document.getElementById("clearPendingImports").addEventListener("click", () => {
      state.pendingFileRecords = [];
      document.getElementById("fileImport").value = "";
      addLog("pending import records를 비웠습니다.");
    });

    document.getElementById("loadFixture").addEventListener("click", loadFixtureData);
    document.getElementById("refreshExport").addEventListener("click", renderExport);
    document.getElementById("approveReply").addEventListener("click", () => {
      const signal = state.clusters[state.selectedCluster]?.signals[0];
      if (signal) state.reviewStatus.set(signal.id, "approved");
      renderReviewAndBacklog();
      renderExport();
    });
    document.getElementById("escalateReply").addEventListener("click", () => {
      const signal = state.clusters[state.selectedCluster]?.signals[0];
      if (signal) state.reviewStatus.set(signal.id, "needs human review");
      renderReviewAndBacklog();
      renderExport();
    });

    setWorkflowStage(0, "샘플 문의 데이터를 불러오는 중입니다.");
    checkApiHealth();
    loadInitialData();

    /* ───────────────────────────────────────────
       오픈채팅 수동 입력 (P2.2 신규)
       source 고정: kakao_openchat_manual
       PII 1차 가림: 클라이언트 정규식 (시각적 안심용)
       최종 마스킹: server.py::mask_pii (서버 재실행)
       localStorage 키: oc_today_count / oc_today_date
    ─────────────────────────────────────────── */

    // localStorage 카운터: 날짜 기준 매일 리셋 (만료 정책: 날짜 변경 시 자동 초기화)
    const OC_COUNT_KEY = "oc_today_count";
    const OC_DATE_KEY = "oc_today_date";

    function ocGetTodayStr() {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    function ocLoadTodayCount() {
      const savedDate = localStorage.getItem(OC_DATE_KEY);
      const today = ocGetTodayStr();
      if (savedDate !== today) {
        localStorage.setItem(OC_DATE_KEY, today);
        localStorage.setItem(OC_COUNT_KEY, "0");
        return 0;
      }
      return parseInt(localStorage.getItem(OC_COUNT_KEY) || "0", 10);
    }

    function ocSaveTodayCount(count) {
      localStorage.setItem(OC_DATE_KEY, ocGetTodayStr());
      localStorage.setItem(OC_COUNT_KEY, String(count));
    }

    // 클라이언트 PII 1차 가림 (server.py::mask_pii 와 동일 패턴 세트)
    // 목적: 시각적 안심. 서버 mask_pii 가 final.
    function ocClientMaskPii(text) {
      let masked = text;
      // 이메일
      masked = masked.replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, "[이메일]");
      // 전화번호 (한국 휴대폰)
      masked = masked.replace(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g, "[전화번호]");
      // 주문번호 패턴 (숫자 3-4자리-4자리-4자리)
      masked = masked.replace(/\b\d{3,4}[-\s]\d{4}[-\s]\d{4}\b/g, "[주문번호]");
      // 알파벳 대문자 코드 + 6자리 이상 숫자 (주문번호 유형)
      masked = masked.replace(/\b[A-Z]{2,}[-_]?\d{6,}\b/g, "[주문번호]");
      // 이름 + 호칭
      masked = masked.replace(/[가-힣]{2,4}\s*(씨|님|대표|매니저|팀장|과장|부장|차장|이사|책임|선임|주임)(?=[은는이가을를도와과의에서로께,.\s!?]|$)/g, "[이름]");
      // 회사명
      masked = masked.replace(/(주식회사\s*[가-힣A-Za-z0-9]+|㈜\s*[가-힣A-Za-z0-9]+|[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*\s+(?:Inc|Co|Ltd|Corp)\.?)/g, "[회사명]");
      return masked;
    }

    // textarea 를 빈 줄 또는 줄바꿈 단위로 파싱 → records 배열 생성
    function ocParseLines(rawText, segment, labelHint) {
      const ts = Date.now();
      // 빈 줄로 블록 분리 우선, 없으면 줄 단위
      const blocks = rawText.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
      const lines = blocks.length > 1 ? blocks : rawText.split(/\n/).map((l) => l.trim()).filter(Boolean);
      return lines.map((line, n) => ({
        id: `paste-${n + 1}-${ts}`,
        source: "kakao_openchat_manual",
        channel: "openchat",
        segment: segment || "openchat (수동입력)",
        message: ocClientMaskPii(line),
        label_hint: labelHint || "other"
      }));
    }

    // 파싱 결과 카운트 + PII 미리보기 갱신
    function ocUpdatePreview() {
      const raw = document.getElementById("ocPasteArea").value;
      const segment = document.getElementById("ocSegment").value.trim();
      const labelHint = document.getElementById("ocLabelHint").value;
      const records = ocParseLines(raw, segment, labelHint);
      const todayCount = ocLoadTodayCount();

      // 카운트 표시
      const counterEl = document.getElementById("ocCounter");
      counterEl.innerHTML = `수동입력 <em>${records.length}</em>건 (오늘 누적 <em>${todayCount}</em>건)`;

      // PII 미리보기: 첫 번째 줄만 보여주고 마스킹 적용 여부 표시
      const previewEl = document.getElementById("ocPiiPreview");
      if (!raw.trim()) {
        previewEl.innerHTML = "텍스트를 입력하면 클라이언트 측 PII 1차 가림 결과가 여기에 표시됩니다.";
        return;
      }
      const firstMasked = ocClientMaskPii(records[0]?.message || "");
      const hasMasked = firstMasked.includes("[이메일]") || firstMasked.includes("[전화번호]") || firstMasked.includes("[주문번호]") || firstMasked.includes("[이름]") || firstMasked.includes("[회사명]");
      previewEl.innerHTML = `<em>${records.length}줄 파싱됨</em> · 1차 PII 가림 ${hasMasked ? '<em>적용됨</em>' : '없음'}<br><span style="color:var(--text)">${firstMasked.slice(0, 80)}${firstMasked.length > 80 ? "…" : ""}</span>`;
    }

    // 오픈채팅 수동 입력 → /api/classify 재사용 (P1 카논 endpoint 그대로)
    async function ocRunClassify() {
      const raw = document.getElementById("ocPasteArea").value.trim();
      if (!raw) {
        document.getElementById("ocResultMsg").textContent = "붙여넣을 메시지가 없습니다. 텍스트를 입력해 주세요.";
        return;
      }
      const segment = document.getElementById("ocSegment").value.trim() || "openchat (수동입력)";
      const labelHint = document.getElementById("ocLabelHint").value;
      const records = ocParseLines(raw, segment, labelHint);

      const btn = document.getElementById("ocRunBtn");
      btn.disabled = true;
      btn.textContent = "분류 중…";
      document.getElementById("ocResultMsg").innerHTML = `<em>${records.length}</em>건 파싱 완료 · PMF Radar 진입 중…`;

      // 기존 inquiries 에 병합 (source 필드 포함 그대로 전달, normalize_records 서버에서 처리)
      const existingIds = new Set(state.inquiries.map((item) => item.id));
      const fresh = records.filter((r) => !existingIds.has(r.id));
      state.inquiries = [...state.inquiries, ...fresh];

      // localStorage 카운터 누적
      const prevCount = ocLoadTodayCount();
      ocSaveTodayCount(prevCount + records.length);
      document.getElementById("ocCounter").innerHTML = `수동입력 <em>${records.length}</em>건 (오늘 누적 <em>${prevCount + records.length}</em>건)`;

      addLog(`오픈채팅 수동입력 ${records.length}건 — source: kakao_openchat_manual`);
      setWorkflowStage(0, `오픈채팅 수동입력 ${records.length}건을 분석 대상으로 준비했습니다.`);

      try {
        setWorkflowStage(1, "kakao_openchat_manual → channel: openchat 으로 정규화합니다.");
        await new Promise((resolve) => setTimeout(resolve, 120));
        setWorkflowStage(2, "클라이언트 PII 1차 가림 완료 · 서버 mask_pii 재실행 중");

        const started = performance.now();
        setWorkflowStage(3, "hplan evidence schema 구조화 중…");

        const response = await fetch("/api/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records })
        });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || data.detail || "classification failed");

        state.mode = "gpt";
        state.apiModel = data.run_summary?.model || state.apiModel;
        const newSignals = (data.signals || []).map(mapApiSignal);
        state.gptSignals = [...(state.gptSignals || []), ...newSignals];
        state.gptBacklog = data.backlog || [];
        state.selectedCluster = 0;

        setWorkflowStage(4, `${newSignals.length}건 evidence → 답변 초안 또는 운영자 검토로 분기했습니다.`);
        await new Promise((resolve) => setTimeout(resolve, 120));
        setWorkflowStage(5, "PMF Radar와 hplan Backlog에 오픈채팅 evidence가 적재되었습니다.");
        setRunMeta({
          engine: "hplan 분석 엔진 (오픈채팅 수동입력)",
          records: newSignals.length,
          latency: `${data.run_summary?.latency_ms || Math.round(performance.now() - started)}ms`,
          gate: data.run_summary?.hplan_gate || "evidence"
        });

        document.getElementById("ocResultMsg").innerHTML = `<em>${records.length}</em>건 분류 완료 · PMF Radar에 반영되었습니다. <a href="#lab" style="color:var(--accent);font-weight:700">Radar 보기 ↓</a>`;
        renderAll();

      } catch (error) {
        // API 실패 시 로컬 기준으로 폴백. 기존 gptSignals 는 보존한다.
        reportError("ocRunClassify", error);
        state.mode = "local";
        setWorkflowStage(5, `서버 분석 실패: ${error.message}. 로컬 기준으로 분석합니다.`);
        setRunMeta({ engine: "로컬 기준 분석 (오픈채팅 폴백)", latency: "fallback", gate: "evidence" });
        document.getElementById("ocResultMsg").innerHTML = `서버 연결 실패 — <em>로컬 기준</em>으로 ${records.length}건 분류 완료. <a href="#lab" style="color:var(--accent);font-weight:700">Radar 보기 ↓</a>`;
        renderAll();
      } finally {
        btn.disabled = false;
        btn.textContent = "정규화 + PMF Radar 진입";
      }
    }

    // 이벤트 바인딩
    document.getElementById("ocPasteArea").addEventListener("input", ocUpdatePreview);
    document.getElementById("ocSegment").addEventListener("input", ocUpdatePreview);
    document.getElementById("ocLabelHint").addEventListener("change", ocUpdatePreview);
    document.getElementById("ocRunBtn").addEventListener("click", ocRunClassify);

    // 초기 카운터 렌더링 (새로고침 후 유지)
    (function ocInitCounter() {
      const todayCount = ocLoadTodayCount();
      document.getElementById("ocCounter").innerHTML = `수동입력 <em>0</em>건 (오늘 누적 <em>${todayCount}</em>건)`;
    })();
