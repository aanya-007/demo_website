/* ============================================================
   script.js — Student Feedback App
   Handles: form validation, API calls, admin CRUD
   ============================================================ */

// ─── SHARED UTILITY ─────────────────────────────────────────

/** Shows a temporary toast notification at the bottom-right. */
function showToast(message, type = 'success') {
  // Remove any existing toast
  const old = document.getElementById('toast');
  if (old) old.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = `toast ${type}-toast`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger show animation on next frame
  requestAnimationFrame(() => toast.classList.add('show'));

  // Auto-hide after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

/** Displays an inline error below an input field. */
function setError(fieldId, message) {
  const errEl = document.getElementById(`${fieldId}-error`);
  if (errEl) errEl.textContent = message;
}

/** Clears all inline error messages in the form. */
function clearErrors() {
  document.querySelectorAll('.error-msg').forEach(el => el.textContent = '');
}


// ─── INDEX PAGE: FEEDBACK FORM ──────────────────────────────

const feedbackForm = document.getElementById('feedbackForm');

if (feedbackForm) {
  feedbackForm.addEventListener('submit', async function (e) {
    e.preventDefault();   // stop default HTML form submission
    clearErrors();

    // ── Collect values ──
    const name    = document.getElementById('name').value.trim();
    const event   = document.getElementById('event').value;
    const message = document.getElementById('message').value.trim();

    // ── Client-side validation ──
    let hasError = false;

    if (!name) {
      setError('name', 'Please enter your name.');
      hasError = true;
    } else if (name.length < 2) {
      setError('name', 'Name must be at least 2 characters.');
      hasError = true;
    }

    if (!event) {
      setError('event', 'Please select an event.');
      hasError = true;
    }

    if (!message) {
      setError('message', 'Please write your feedback.');
      hasError = true;
    } else if (message.length < 10) {
      setError('message', 'Feedback must be at least 10 characters.');
      hasError = true;
    }

    if (hasError) return;   // stop if validation failed

    // ── Disable button while submitting ──
    const submitBtn = feedbackForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      // ── Send POST request to Flask backend ──
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, event, message })
      });

      const data = await response.json();

      if (response.ok) {
        // Redirect to success page
        window.location.href = '/success';
      } else {
        showToast(data.error || 'Something went wrong.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Feedback';
      }
    } catch (err) {
      showToast('Could not connect to server. Is Flask running?', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Feedback';
    }
  });
}


// ─── ADMIN PAGE ─────────────────────────────────────────────

const adminPassword = { value: '' };  // store password in memory for this session

// ── LOGIN ──
const loginBtn = document.getElementById('loginBtn');
if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    const pw = document.getElementById('adminPassword').value;
    if (!pw) { showToast('Enter the admin password.', 'error'); return; }

    adminPassword.value = pw;
    await loadFeedbacks();
  });
}

/** Fetches all feedback entries from the API and renders the table. */
async function loadFeedbacks() {
  try {
    const response = await fetch('/api/feedback', {
      headers: { 'X-Admin-Password': adminPassword.value }
    });

    if (response.status === 401) {
      showToast('Wrong password. Try again.', 'error');
      adminPassword.value = '';
      return;
    }

    const feedbacks = await response.json();

    // Show admin panel, hide login form
    document.getElementById('login-section').style.display  = 'none';
    document.getElementById('admin-section').style.display  = 'block';

    renderTable(feedbacks);
    renderStats(feedbacks);

  } catch (err) {
    showToast('Could not connect to server.', 'error');
  }
}

/** Renders rows into the feedback table. */
function renderTable(feedbacks) {
  const tbody = document.getElementById('feedbackTableBody');
  tbody.innerHTML = '';

  if (feedbacks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-data">📭 No feedback submitted yet.</td></tr>';
    return;
  }

  feedbacks.forEach(fb => {
    const tr = document.createElement('tr');
    tr.dataset.id = fb.id;

    // Format the timestamp nicely
    const date = new Date(fb.created_at).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    tr.innerHTML = `
      <td>${fb.id}</td>
      <td>${escapeHtml(fb.name)}</td>
      <td><span class="badge">${escapeHtml(fb.event)}</span></td>
      <td>${escapeHtml(fb.message)}</td>
      <td style="white-space:nowrap; color:var(--muted); font-size:0.82rem;">${date}</td>
      <td class="actions-cell">
        <button class="btn btn-edit" onclick="openEditModal(${fb.id}, '${escapeAttr(fb.name)}', '${escapeAttr(fb.event)}', '${escapeAttr(fb.message)}')">✏️ Edit</button>
        <button class="btn btn-danger" onclick="deleteFeedback(${fb.id})">🗑️ Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/** Renders summary stats above the table. */
function renderStats(feedbacks) {
  document.getElementById('stat-total').textContent = feedbacks.length;

  // Count unique events
  const events = new Set(feedbacks.map(f => f.event));
  document.getElementById('stat-events').textContent = events.size;

  // Most recent submission date
  if (feedbacks.length > 0) {
    const latest = new Date(feedbacks[0].created_at).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    document.getElementById('stat-latest').textContent = latest;
  } else {
    document.getElementById('stat-latest').textContent = '—';
  }
}


// ─── DELETE ─────────────────────────────────────────────────

async function deleteFeedback(id) {
  if (!confirm('Are you sure you want to delete this feedback?')) return;

  try {
    const response = await fetch(`/api/feedback/${id}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Password': adminPassword.value }
    });
    const data = await response.json();

    if (response.ok) {
      showToast('Feedback deleted.', 'success');
      await loadFeedbacks();   // refresh table
    } else {
      showToast(data.error || 'Delete failed.', 'error');
    }
  } catch (err) {
    showToast('Could not connect to server.', 'error');
  }
}


// ─── EDIT MODAL ──────────────────────────────────────────────

let editingId = null;

function openEditModal(id, name, event, message) {
  editingId = id;
  document.getElementById('editName').value    = name;
  document.getElementById('editEvent').value   = event;
  document.getElementById('editMessage').value = message;
  document.getElementById('editModal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('open');
  editingId = null;
}

// Close modal when clicking the overlay background
const editModal = document.getElementById('editModal');
if (editModal) {
  editModal.addEventListener('click', function (e) {
    if (e.target === this) closeEditModal();
  });
}

// Save edit
const saveEditBtn = document.getElementById('saveEditBtn');
if (saveEditBtn) {
  saveEditBtn.addEventListener('click', async () => {
    const name    = document.getElementById('editName').value.trim();
    const event   = document.getElementById('editEvent').value;
    const message = document.getElementById('editMessage').value.trim();

    if (!name || !event || !message) {
      showToast('All fields are required.', 'error');
      return;
    }

    try {
      const response = await fetch(`/api/feedback/${editingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword.value
        },
        body: JSON.stringify({ name, event, message })
      });
      const data = await response.json();

      if (response.ok) {
        showToast('Feedback updated!', 'success');
        closeEditModal();
        await loadFeedbacks();   // refresh table
      } else {
        showToast(data.error || 'Update failed.', 'error');
      }
    } catch (err) {
      showToast('Could not connect to server.', 'error');
    }
  });
}


// ─── SECURITY HELPERS ───────────────────────────────────────

/** Prevents XSS when inserting user text as HTML. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escapes text for use inside HTML attribute values (e.g. onclick="..."). */
function escapeAttr(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}
