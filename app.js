import { 
  db, doc, collection, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp 
} from "./firebase.js";

// Global App State
let visitorId = '';
let currentAddons = [];
let userLikes = new Set();
let userSaves = new Set();
let currentDetailAddon = null;

// Initialize Visitor ID
function initVisitorId() {
  visitorId = localStorage.getItem('pa_visitor_id');
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem('pa_visitor_id', visitorId);
  }
  const idDisplay = document.getElementById('profile-id-text');
  if (idDisplay) idDisplay.innerText = `Visitor ID: ${visitorId}`;
}

// Toast
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  let icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info');
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// Routing
window.navigateTo = function(pageId) {
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-btn, .bottom-nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.page === pageId));
  const targetView = document.getElementById(`view-${pageId}`);
  if (targetView) targetView.classList.add('active');

  if (pageId === 'home') renderAddons(currentAddons);
  if (pageId === 'liked') fetchLikedAddons();
  if (pageId === 'saved') fetchSavedAddons();
  if (pageId === 'history') fetchHistoryAddons();
  if (pageId === 'profile') loadGuestProfile();
};

// Fetch Interactions
async function fetchUserInteractions() {
  try {
    const likesSnap = await getDocs(query(collection(db, "likes"), where("visitorId", "==", visitorId)));
    userLikes = new Set(likesSnap.docs.map(d => d.data().addonId));
    const savesSnap = await getDocs(query(collection(db, "saves"), where("visitorId", "==", visitorId)));
    userSaves = new Set(savesSnap.docs.map(d => d.data().addonId));
  } catch (err) {}
}

// Fetch Addons
async function fetchAddons() {
  showSkeletons();
  try {
    const snap = await getDocs(query(collection(db, "addons"), orderBy("createdAt", "desc")));
    currentAddons = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderAddons(currentAddons);
  } catch (err) { showToast("Gagal memuat addon", "error"); }
}

function showSkeletons() {
  document.getElementById('addon-grid').innerHTML = Array(6).fill(0).map(() => `<div class="skeleton-card"></div>`).join('');
}

// Render Addon Cards
function renderAddons(list, targetGridId = 'addon-grid') {
  const grid = document.getElementById(targetGridId);
  document.getElementById('addon-count').innerText = `${list.length} Addon`;

  if (list.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">Tidak ada addon.</div>`;
    return;
  }

  grid.innerHTML = list.map(addon => {
    const isLiked = userLikes.has(addon.id);
    return `
      <div class="addon-card" onclick="openDetailModal('${addon.id}')">
        <img class="addon-card-thumb" src="${addon.thumbnailURL}" onerror="this.src='https://placehold.co/600x400/1e1b4b/FFF?text=No+Image'" alt="Thumbnail" loading="lazy">
        <div class="addon-card-body">
          <div class="card-title-wrap">
            <h3 class="card-title">${escapeHtml(addon.name)}</h3>
            <span class="card-version">${escapeHtml(addon.version)}</span>
          </div>
          <p class="card-desc">${escapeHtml(addon.description)}</p>
          <div class="card-meta">
            <span class="rating-stars"><i class="fa-solid fa-star"></i> ${(addon.averageRating || 0).toFixed(1)}</span>
            <span><i class="fa-solid fa-heart ${isLiked ? 'text-danger' : ''}"></i> ${addon.likeCount || 0}</span>
            <span>By ${escapeHtml(addon.authorName || 'Guest')}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Search & Sort
window.filterAddons = function() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const sortBy = document.getElementById('sort-select').value;
  let filtered = currentAddons.filter(item => 
    item.name.toLowerCase().includes(search) || item.description.toLowerCase().includes(search)
  );

  if (sortBy === 'rating') filtered.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
  else if (sortBy === 'likes') filtered.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
  else filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  renderAddons(filtered);
};

// Modals
window.openUploadModal = () => document.getElementById('upload-modal').classList.add('open');
window.closeUploadModal = () => document.getElementById('upload-modal').classList.remove('open');
window.closeDetailModal = () => document.getElementById('detail-modal').classList.remove('open');

// HANDLE UPLOAD INSTAN (PAKAI LINK)
window.handleUploadAddon = async function(e) {
  e.preventDefault();
  const thumbnailURL = document.getElementById('upload-thumbnail').value;
  const fileURL = document.getElementById('upload-file').value;
  const name = document.getElementById('upload-name').value;
  const version = document.getElementById('upload-version').value;
  const description = document.getElementById('upload-desc').value;

  const submitBtn = document.getElementById('btn-submit-upload');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mempublikasikan...';

  try {
    let authorName = "Guest";
    try {
      const profileSnap = await getDoc(doc(db, "profiles", visitorId));
      if (profileSnap.exists()) authorName = profileSnap.data().displayName || "Guest";
    } catch (e) {}

    const newDoc = {
      name, version, description, thumbnailURL, fileURL, authorName,
      createdAt: serverTimestamp(), averageRating: 0, ratingCount: 0, likeCount: 0, saveCount: 0
    };

    const docRef = await addDoc(collection(db, "addons"), newDoc);
    showToast("Berhasil dipublish seketika!", "success");
    
    closeUploadModal();
    document.getElementById('upload-form').reset();

    currentAddons.unshift({ id: docRef.id, ...newDoc, createdAt: { seconds: Date.now() / 1000 } });
    renderAddons(currentAddons);
  } catch (err) {
    showToast("Gagal mempublish addon", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "Publish Addon";
  }
};

// Detail View
window.openDetailModal = async function(addonId) {
  const addon = currentAddons.find(a => a.id === addonId);
  if (!addon) return;
  currentDetailAddon = addon;
  logHistory(addonId);

  const isLiked = userLikes.has(addonId);
  const isSaved = userSaves.has(addonId);
  const body = document.getElementById('detail-modal-body');

  body.innerHTML = `
    <img src="${addon.thumbnailURL}" class="detail-header-img" onerror="this.src='https://placehold.co/600x400/1e1b4b/FFF?text=No+Image'">
    <div class="detail-title-bar">
      <div>
        <h2>${escapeHtml(addon.name)}</h2>
        <p class="text-muted">Versi: ${escapeHtml(addon.version)} | Oleh: ${escapeHtml(addon.authorName || 'Guest')}</p>
      </div>
      <span class="badge"><i class="fa-solid fa-star text-warning"></i> ${(addon.averageRating || 0).toFixed(1)} (${addon.ratingCount || 0})</span>
    </div>
    <div class="detail-actions">
      <button class="btn-action-glass ${isLiked ? 'liked' : ''}" onclick="toggleLike('${addon.id}')"><i class="fa-solid fa-heart"></i> <span>${addon.likeCount || 0} Like</span></button>
      <button class="btn-action-glass ${isSaved ? 'saved' : ''}" onclick="toggleSave('${addon.id}')"><i class="fa-solid fa-bookmark"></i> <span>${isSaved ? 'Tersimpan' : 'Simpan'}</span></button>
      <a href="${addon.fileURL}" target="_blank" class="btn-primary-glass" style="text-decoration:none;"><i class="fa-solid fa-download"></i> Download Link</a>
    </div>
    <div style="margin-top:20px;">
      <h4>Deskripsi Addon</h4>
      <p style="color:var(--text-muted); margin-top:8px; line-height:1.6; white-space:pre-line;">${escapeHtml(addon.description)}</p>
    </div>
    <div style="margin-top:25px; border-top:1px solid var(--glass-border); padding-top:15px;">
      <h4>Beri Rating</h4>
      <div class="star-rating-picker">
        <i class="fa-solid fa-star" onclick="submitRating(1)"></i>
        <i class="fa-solid fa-star" onclick="submitRating(2)"></i>
        <i class="fa-solid fa-star" onclick="submitRating(3)"></i>
        <i class="fa-solid fa-star" onclick="submitRating(4)"></i>
        <i class="fa-solid fa-star" onclick="submitRating(5)"></i>
      </div>
    </div>
  `;
  document.getElementById('detail-modal').classList.add('open');
};

// Like & Save
window.toggleLike = async function(addonId) {
  try {
    if (userLikes.has(addonId)) {
      await deleteDoc(doc(db, "likes", `${addonId}_${visitorId}`));
      userLikes.delete(addonId);
      currentDetailAddon.likeCount = Math.max(0, (currentDetailAddon.likeCount || 1) - 1);
    } else {
      await setDoc(doc(db, "likes", `${addonId}_${visitorId}`), { visitorId, addonId, createdAt: serverTimestamp() });
      userLikes.add(addonId);
      currentDetailAddon.likeCount = (currentDetailAddon.likeCount || 0) + 1;
    }
    await updateDoc(doc(db, "addons", addonId), { likeCount: currentDetailAddon.likeCount });
    openDetailModal(addonId); renderAddons(currentAddons);
  } catch (err) { showToast("Gagal", "error"); }
};

window.toggleSave = async function(addonId) {
  try {
    if (userSaves.has(addonId)) {
      await deleteDoc(doc(db, "saves", `${addonId}_${visitorId}`));
      userSaves.delete(addonId);
    } else {
      await setDoc(doc(db, "saves", `${addonId}_${visitorId}`), { visitorId, addonId, createdAt: serverTimestamp() });
      userSaves.add(addonId);
      showToast("Tersimpan!", "success");
    }
    openDetailModal(addonId);
  } catch (err) {}
};

// Rating
window.submitRating = async function(stars) {
  const addonId = currentDetailAddon.id;
  try {
    await setDoc(doc(db, "ratings", `${addonId}_${visitorId}`), { addonId, visitorId, rating: stars });
    const snap = await getDocs(query(collection(db, "ratings"), where("addonId", "==", addonId)));
    const total = snap.docs.length;
    const avg = snap.docs.reduce((acc, d) => acc + d.data().rating, 0) / total;
    
    await updateDoc(doc(db, "addons", addonId), { averageRating: avg, ratingCount: total });
    currentDetailAddon.averageRating = avg; currentDetailAddon.ratingCount = total;
    showToast(`Rating ${stars} bintang berhasil!`, "success");
    openDetailModal(addonId); renderAddons(currentAddons);
  } catch (err) { showToast("Gagal rating", "error"); }
};

// Load Views
async function fetchLikedAddons() { renderAddons(currentAddons.filter(a => userLikes.has(a.id)), 'liked-grid'); }
async function fetchSavedAddons() { renderAddons(currentAddons.filter(a => userSaves.has(a.id)), 'saved-grid'); }
async function logHistory(addonId) { await setDoc(doc(db, "history", `${visitorId}_${addonId}`), { visitorId, addonId, viewedAt: serverTimestamp() }).catch(e=>e); }
async function fetchHistoryAddons() {
  try {
    const snap = await getDocs(query(collection(db, "history"), where("visitorId", "==", visitorId), orderBy("viewedAt", "desc")));
    renderAddons(snap.docs.map(d => d.data().addonId).map(id => currentAddons.find(a => a.id === id)).filter(Boolean), 'history-grid');
  } catch (err) {}
}

window.clearHistory = async function() {
  if (!confirm("Hapus semua riwayat?")) return;
  try {
    const snap = await getDocs(query(collection(db, "history"), where("visitorId", "==", visitorId)));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    showToast("Riwayat dihapus", "success");
    fetchHistoryAddons();
  } catch (err) {}
};

// Profile
async function loadGuestProfile() {
  try {
    const docSnap = await getDoc(doc(db, "profiles", visitorId));
    if (docSnap.exists()) {
      const data = docSnap.data();
      document.getElementById('profile-display-name').innerText = data.displayName || "Guest User";
      document.getElementById('profile-name-input').value = data.displayName || "";
      document.getElementById('profile-avatar-url').value = data.photoURL || "";
      if (data.photoURL) document.getElementById('profile-avatar-img').src = data.photoURL;
    }
  } catch (err) {}
}

window.saveGuestProfile = async function(e) {
  e.preventDefault();
  const displayName = document.getElementById('profile-name-input').value;
  const photoURL = document.getElementById('profile-avatar-url').value;
  const btn = e.target.querySelector('button');
  btn.innerText = "Menyimpan...";
  
  try {
    await setDoc(doc(db, "profiles", visitorId), { displayName, photoURL, updatedAt: serverTimestamp() }, { merge: true });
    document.getElementById('profile-display-name').innerText = displayName;
    if (photoURL) document.getElementById('profile-avatar-img').src = photoURL;
    showToast("Profil tersimpan!", "success");
  } catch (err) { showToast("Gagal menyimpan profil", "error"); }
  btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan Profil`;
};

function escapeHtml(str) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

document.addEventListener('DOMContentLoaded', async () => {
  initVisitorId();
  await fetchUserInteractions();
  await fetchAddons();
});ount: currentDetailAddon.saveCount });
    openDetailModal(addonId);
  } catch (err) {
    showToast("Gagal memperbarui simpanan", "error");
  }
};

// Rating Logic
window.submitRating = async function(stars) {
  if (!currentDetailAddon) return;
  const addonId = currentDetailAddon.id;
  const ratingDocId = `${addonId}_${visitorId}`;
  const ratingRef = doc(db, "ratings", ratingDocId);

  try {
    await setDoc(ratingRef, { addonId, visitorId, rating: stars, createdAt: serverTimestamp() });

    // Recalculate average rating
    const q = query(collection(db, "ratings"), where("addonId", "==", addonId));
    const ratingsSnap = await getDocs(q);
    const totalRatings = ratingsSnap.docs.length;
    const sumRatings = ratingsSnap.docs.reduce((acc, d) => acc + d.data().rating, 0);
    const newAverage = sumRatings / totalRatings;

    // Update Addon Document
    const addonRef = doc(db, "addons", addonId);
    await updateDoc(addonRef, {
      averageRating: newAverage,
      ratingCount: totalRatings
    });

    currentDetailAddon.averageRating = newAverage;
    currentDetailAddon.ratingCount = totalRatings;

    showToast(`Rating ${stars} bintang berhasil dikirim!`, "success");
    openDetailModal(addonId);
    renderAddons(currentAddons);
  } catch (err) {
    showToast("Gagal memberikan rating", "error");
  }
};

// Liked & Saved Views Fetching
async function fetchLikedAddons() {
  const grid = document.getElementById('liked-grid');
  grid.innerHTML = '<div class="skeleton-card"></div>';
  const likedList = currentAddons.filter(a => userLikes.has(a.id));
  renderAddons(likedList, 'liked-grid');
}

async function fetchSavedAddons() {
  const grid = document.getElementById('saved-grid');
  grid.innerHTML = '<div class="skeleton-card"></div>';
  const savedList = currentAddons.filter(a => userSaves.has(a.id));
  renderAddons(savedList, 'saved-grid');
}

// History Handling
async function logHistory(addonId) {
  const historyDocId = `${visitorId}_${addonId}`;
  try {
    await setDoc(doc(db, "history", historyDocId), {
      visitorId,
      addonId,
      viewedAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Error logging history:", err);
  }
}

async function fetchHistoryAddons() {
  const grid = document.getElementById('history-grid');
  grid.innerHTML = '<div class="skeleton-card"></div>';
  try {
    const q = query(
      collection(db, "history"), 
      where("visitorId", "==", visitorId),
      orderBy("viewedAt", "desc")
    );
    const snap = await getDocs(q);
    const addonIds = snap.docs.map(d => d.data().addonId);

    const historyAddons = addonIds
      .map(id => currentAddons.find(a => a.id === id))
      .filter(Boolean);

    renderAddons(historyAddons, 'history-grid');
  } catch (err) {
    grid.innerHTML = '<div style="color:var(--text-muted);">Gagal memuat riwayat.</div>';
  }
}

window.clearHistory = async function() {
  if (!confirm("Apakah Anda yakin ingin menghapus semua riwayat dilihat?")) return;
  try {
    const q = query(collection(db, "history"), where("visitorId", "==", visitorId));
    const snap = await getDocs(q);
    const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    showToast("Riwayat berhasil dihapus", "success");
    fetchHistoryAddons();
  } catch (err) {
    showToast("Gagal menghapus riwayat", "error");
  }
};

// Profile Guest Handling
async function loadGuestProfile() {
  try {
    const docSnap = await getDoc(doc(db, "profiles", visitorId));
    if (docSnap.exists()) {
      const data = docSnap.data();
      document.getElementById('profile-display-name').innerText = data.displayName || "Guest User";
      document.getElementById('profile-name-input').value = data.displayName || "";
      if (data.photoURL) {
        document.getElementById('profile-avatar-img').src = data.photoURL;
      }
    }
  } catch (err) {
    console.error("Error loading profile:", err);
  }
}

window.saveGuestProfile = async function(e) {
  e.preventDefault();
  const displayName = document.getElementById('profile-name-input').value;
  try {
    await setDoc(doc(db, "profiles", visitorId), {
      displayName,
      updatedAt: serverTimestamp()
    }, { merge: true });

    document.getElementById('profile-display-name').innerText = displayName;
    showToast("Profil guest berhasil disimpan!", "success");
  } catch (err) {
    showToast("Gagal menyimpan profil", "error");
  }
};

window.handleProfileAvatarUpload = async function(e) {
  const file = e.target.files[0];
  if (!file) return;

  showToast("Mengunggah foto profil...", "info");
  try {
    const avatarRef = ref(storage, `avatars/${visitorId}_${Date.now()}`);
    await uploadBytesResumable(avatarRef, file);
    const photoURL = await getDownloadURL(avatarRef);

    await setDoc(doc(db, "profiles", visitorId), {
      photoURL,
      updatedAt: serverTimestamp()
    }, { merge: true });

    document.getElementById('profile-avatar-img').src = photoURL;
    showToast("Foto profil berhasil diperbarui!", "success");
  } catch (err) {
    showToast("Gagal mengunggah foto profil", "error");
  }
};

// Utility Helper
function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  initVisitorId();
  await fetchUserInteractions();
  await fetchAddons();
});