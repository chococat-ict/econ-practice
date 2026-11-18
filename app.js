const state = {
  catalog: null,
  mode: "mcq",
  subject: "Both",
  topic: "all",
  shuffle: false,
  pool: [],
  index: 0,
  reviewing: false,
  pending: null,
  attempts: loadAttempts(),
};

const $ = (id) => document.getElementById(id);

function loadAttempts() {
  try {
    return JSON.parse(localStorage.getItem("econ-practice") || "{}");
  } catch {
    return {};
  }
}

function saveAttempts() {
  localStorage.setItem("econ-practice", JSON.stringify(state.attempts));
}

function attempt(question) {
  return state.attempts[question.id] || {};
}

function patch(question, fields) {
  state.attempts[question.id] = { ...attempt(question), ...fields };
  saveAttempts();
}

function clearAttempt(question) {
  delete state.attempts[question.id];
  saveAttempts();
}

function questions() {
  return state.catalog.questions.filter((question) => question.kind === state.mode);
}

function groups() {
  return state.catalog.syllabus[state.mode];
}

function rankOf(topic) {
  const order = groups().flatMap((group) => group[2]);
  const index = order.indexOf(topic);
  return index === -1 ? 10000 : index;
}

function fillTopics() {
  const select = $("topic");
  const available = new Set(
    questions()
      .filter((question) => state.subject === "Both" || question.subject === state.subject)
      .map((question) => question.topic)
  );
  const previous = state.topic;
  select.replaceChildren();
  select.add(new Option("All topics", "all"));
  for (const [code, title, topics] of groups()) {
    const present = topics.filter((topic) => available.has(topic));
    if (!present.length) continue;
    const group = document.createElement("optgroup");
    group.label = `${code} · ${title}`;
    group.append(new Option(`All of ${code} · ${title}`, `group:${code}`));
    for (const topic of present) group.append(new Option(topic, `topic:${topic}`));
    select.append(group);
  }
  const values = [...select.options].map((option) => option.value);
  state.topic = values.includes(previous) ? previous : "all";
  select.value = state.topic;
}

function selectedTopics() {
  if (state.topic === "all") return null;
  if (state.topic.startsWith("group:")) {
    const code = state.topic.slice(6);
    const group = groups().find((item) => item[0] === code);
    return new Set(group ? group[2] : []);
  }
  if (state.topic.startsWith("topic:")) return new Set([state.topic.slice(6)]);
  return new Set([state.topic]);
}

function isGroup() {
  return state.topic.startsWith("group:");
}

function buildPool(ids) {
  let pool;
  if (ids) {
    const wanted = new Set(ids);
    pool = questions().filter((question) => wanted.has(question.id));
  } else {
    const allowed = selectedTopics();
    pool = questions().filter((question) => {
      if (state.subject !== "Both" && question.subject !== state.subject) return false;
      if (allowed && !allowed.has(question.topic)) return false;
      return true;
    });
    pool.sort((a, b) => rankOf(a.topic) - rankOf(b.topic));
  }
  if (!ids && (state.shuffle || isGroup())) shuffle(pool);
  state.pool = pool;
  state.index = 0;
  state.pending = null;
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

function current() {
  if (!state.pool.length) return null;
  state.index = Math.max(0, Math.min(state.index, state.pool.length - 1));
  return state.pool[state.index];
}

function wrongQuestions() {
  return state.pool.filter((question) => {
    const saved = attempt(question);
    if (question.kind === "mcq") return saved.chosen && saved.chosen !== question.answer;
    return saved.verdict === "wrong";
  });
}

function renderScore() {
  const wrong = wrongQuestions();
  $("wrong").textContent = `Wrong ${wrong.length}`;
  if (state.mode === "mcq") {
    const answered = state.pool.filter((question) => attempt(question).chosen);
    const correct = answered.filter((question) => attempt(question).chosen === question.answer).length;
    $("score").textContent = `${correct} CORRECT · ${answered.length} ANSWERED`;
  } else {
    const right = state.pool.filter((question) => attempt(question).verdict === "right").length;
    const marked = state.pool.filter((question) => attempt(question).verdict === "wrong").length;
    $("score").textContent = `${right} RIGHT · ${marked} WRONG`;
  }
}

function escapeText(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function render() {
  renderScore();
  const question = current();
  const stage = $("stage");
  const tag = state.mode === "lq" ? "LONG" : "MCQ";
  const prefix = state.reviewing ? "REDO · " : "";
  if (!question) {
    $("progress").textContent = "NO QUESTIONS IN THIS TOPIC";
    stage.innerHTML = `<article class="paper">Choose another subject or topic.</article>`;
    $("action").disabled = true;
    return;
  }
  $("progress").textContent =
    `${prefix}${tag}  ${String(state.index + 1).padStart(2, "0")} / ${String(state.pool.length).padStart(2, "0")}  ·  ${question.subject.toUpperCase()} · ${question.topic.toUpperCase()}`;
  const saved = attempt(question);
  const marks = question.marks ? ` · ${question.marks.toUpperCase()}` : "";
  const meta = question.kind === "mcq" ? "SELECT ONE" : `${escapeText(question.source)}${escapeText(marks)}`;
  let html = `<p class="meta">${meta}</p><article class="paper">${escapeText(question.text)}</article>`;
  if (question.diagrams && question.diagrams.length) {
    const pictures = question.diagrams
      .map((src) => `<img src="${escapeText(src)}" alt="Diagram">`)
      .join("");
    const pdfLink = question.kind === "lq" || !question.pdf
      ? ""
      : ` · <a href="${escapeText(question.pdf)}" target="_blank" rel="noopener">Open the original PDF</a>`;
    const caption = question.kind === "lq" ? "" : `<p>Diagram from the original PDF${pdfLink}</p>`;
    html += `<div class="figures">${pictures}${caption}</div>`;
  }
  const showDiagram = question.hasDiagram || (saved.revealed && question.answerHasDiagram && !question.hasDiagram);
  if (question.kind !== "lq" && showDiagram && question.pdf && !(question.diagrams && question.diagrams.length)) {
    const note = question.hasDiagram
      ? "This question includes a diagram or picture."
      : "The marking scheme includes a diagram.";
    html += `<aside class="diagram">${note}<br>Search the original PDF for ${escapeText(question.source)}.<br><a href="${escapeText(question.pdf)}" target="_blank" rel="noopener">Open original PDF</a></aside>`;
  }
  if (question.kind === "mcq") {
    const locked = Boolean(saved.chosen);
    const pending = locked ? saved.chosen : state.pending;
    for (const letter of ["A", "B", "C", "D"]) {
      if (!question.options[letter]) continue;
      let cls = "option";
      if (locked && letter === question.answer) cls += " right";
      else if (locked && letter === saved.chosen) cls += " miss";
      else if (!locked && letter === pending) cls += " picked";
      html += `<button type="button" class="${cls}" data-letter="${letter}"><b>${letter}</b><span>${escapeText(question.options[letter])}</span></button>`;
    }
    if (locked) {
      const yours = `${saved.chosen}. ${question.options[saved.chosen] || ""}`;
      const solution = `${question.answer}. ${question.options[question.answer] || ""}`;
      const ok = saved.chosen === question.answer;
      html += `<section class="result ${ok ? "ok" : "bad"}"><h3>${ok ? "Correct" : "Not quite"}</h3>${
        ok ? "" : `<p>Your answer: ${escapeText(yours)}</p>`
      }<p>Solution: ${escapeText(solution)}</p></section>`;
    }
    const action = $("action");
    action.textContent = locked ? "Answered" : "Check answer";
    action.disabled = locked;
  } else {
    html += `<p class="caption">YOUR ANSWER</p><textarea id="draft" ${saved.revealed ? "disabled" : ""}>${escapeText(saved.draft || "")}</textarea>`;
    if (saved.revealed) {
      const tone = saved.verdict === "right" ? "ok" : saved.verdict === "wrong" ? "bad" : "";
      const title = saved.verdict === "right" ? "Marked right" : saved.verdict === "wrong" ? "Marked wrong" : "Marking scheme";
      html += `<section class="scheme ${tone}"><h3>${title}</h3><div class="paper">${escapeText(question.solution || "No marking scheme in the spreadsheet.")}</div></section>`;
      html += `<div class="verdict"><button type="button" class="ok" id="mark-right">I got it right</button><button type="button" class="bad" id="mark-wrong">I got it wrong</button></div>`;
    }
    const action = $("action");
    action.textContent = saved.revealed ? "Solution shown" : "Show solution";
    action.disabled = Boolean(saved.revealed);
  }
  stage.innerHTML = html;
  stage.querySelectorAll("[data-letter]").forEach((button) => {
    button.onclick = () => {
      if (attempt(question).chosen) return;
      state.pending = button.dataset.letter;
      render();
    };
  });
  const draft = $("draft");
  if (draft) {
    draft.oninput = () => patch(question, { draft: draft.value });
  }
  const right = $("mark-right");
  const wrong = $("mark-wrong");
  if (right) right.onclick = () => { patch(question, { verdict: "right" }); render(); };
  if (wrong) wrong.onclick = () => { patch(question, { verdict: "wrong" }); render(); };
  const shown = document.querySelector(".verdict") || document.querySelector(".result");
  if (shown) shown.scrollIntoView({ block: "end" });
  else window.scrollTo(0, 0);
}

function reload(keepReview) {
  if (!keepReview) state.reviewing = false;
  buildPool();
  render();
}

function showWrong() {
  const wrong = wrongQuestions();
  $("wrong-hint").textContent = wrong.length ? `${wrong.length} to redo in this set` : "None in this set yet.";
  $("redo").disabled = !wrong.length;
  $("wrong-list").innerHTML = wrong.map((question) => {
    const saved = attempt(question);
    const first = (question.text.split("\n").find((line) => line.trim()) || question.source || "").slice(0, 180);
    const detail = question.kind === "mcq"
      ? `Yours ${saved.chosen}. Solution ${question.answer}.`
      : `Your answer: ${(saved.draft || "").replaceAll("\n", " ").slice(0, 160)}`;
    return `<button type="button" class="wrong-item" data-id="${escapeText(question.id)}"><small>${escapeText(question.subject)} · ${escapeText(question.topic)}</small>${escapeText(first)}<br><em>${escapeText(detail)}</em></button>`;
  }).join("");
  $("wrong-list").querySelectorAll(".wrong-item").forEach((button) => {
    button.onclick = () => redo(button.dataset.id);
  });
  $("wrong-dialog").showModal();
}

function redo(startId) {
  const wrong = wrongQuestions();
  if (!wrong.length) return;
  const ids = wrong.map((question) => question.id);
  wrong.forEach(clearAttempt);
  state.reviewing = true;
  buildPool(ids);
  if (state.shuffle || isGroup()) shuffle(state.pool);
  if (startId) {
    const at = state.pool.findIndex((question) => question.id === startId);
    if (at >= 0) state.index = at;
  }
  $("wrong-dialog").close();
  render();
}

function primary() {
  const question = current();
  if (!question) return;
  const saved = attempt(question);
  if (question.kind === "mcq") {
    if (saved.chosen) return;
    if (!state.pending) {
      $("progress").textContent += " · CHOOSE AN OPTION FIRST";
      return;
    }
    patch(question, { chosen: state.pending });
    state.pending = null;
    render();
    return;
  }
  if (saved.revealed) return;
  const draft = ($("draft") && $("draft").value) || saved.draft || "";
  if (!draft.trim()) {
    $("progress").textContent += " · WRITE YOUR ANSWER FIRST";
    return;
  }
  patch(question, { draft, revealed: true });
  render();
}

function bind() {
  document.querySelectorAll(".mode").forEach((button) => {
    button.onclick = () => {
      state.mode = button.dataset.mode;
      state.reviewing = false;
      document.querySelectorAll(".mode").forEach((item) => item.classList.toggle("on", item === button));
      fillTopics();
      reload();
    };
  });
  $("subject").onchange = () => {
    state.subject = $("subject").value;
    state.reviewing = false;
    fillTopics();
    reload();
  };
  $("topic").onchange = () => {
    state.topic = $("topic").value;
    state.reviewing = false;
    reload();
  };
  $("shuffle").onchange = () => {
    state.shuffle = $("shuffle").checked;
    reload();
  };
  $("prev").onclick = () => { if (state.index > 0) { state.index -= 1; state.pending = null; render(); } };
  $("next").onclick = () => { if (state.index < state.pool.length - 1) { state.index += 1; state.pending = null; render(); } };
  $("action").onclick = primary;
  $("wrong").onclick = showWrong;
  $("wrong-close").onclick = () => $("wrong-dialog").close();
  $("redo").onclick = () => redo();
}

async function main() {
  const response = await fetch("data.json");
  state.catalog = await response.json();
  bind();
  fillTopics();
  reload();
}

main();
