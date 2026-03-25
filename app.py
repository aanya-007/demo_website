from flask import Flask, request, jsonify, send_from_directory
import sqlite3
import os

# --- App Setup ---
app = Flask(__name__, static_folder='static', template_folder='templates')

# Vercel's filesystem is read-only except /tmp
DB_PATH = '/tmp/feedback.db' if os.environ.get('VERCEL') else 'feedback.db'

ADMIN_PASSWORD = 'admin123'  # Change this to your own password


# --- Database Initialization ---
def init_db():
    """Creates the database and feedbacks table if they don't exist."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS feedbacks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            event       TEXT    NOT NULL,
            message     TEXT    NOT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()


# --- Helper: get a DB connection ---
def get_db():
    init_db()  # ensure table exists on every request (important for Vercel /tmp)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row   # rows behave like dicts
    return conn


# ============================================================
# SERVE PAGES
# ============================================================

@app.route('/')
def index():
    return send_from_directory('templates', 'index.html')

@app.route('/success')
def success():
    return send_from_directory('templates', 'success.html')

@app.route('/admin')
def admin():
    return send_from_directory('templates', 'admin.html')


# ============================================================
# API ROUTES (JSON)
# ============================================================

# CREATE – submit new feedback
@app.route('/api/feedback', methods=['POST'])
def create_feedback():
    data = request.get_json()

    name    = data.get('name', '').strip()
    event   = data.get('event', '').strip()
    message = data.get('message', '').strip()

    if not name or not event or not message:
        return jsonify({'error': 'All fields are required.'}), 400

    conn = get_db()
    conn.execute(
        'INSERT INTO feedbacks (name, event, message) VALUES (?, ?, ?)',
        (name, event, message)
    )
    conn.commit()
    conn.close()

    return jsonify({'message': 'Feedback submitted successfully!'}), 201


# READ – get all feedbacks (admin only)
@app.route('/api/feedback', methods=['GET'])
def get_all_feedback():
    password = request.headers.get('X-Admin-Password', '')
    if password != ADMIN_PASSWORD:
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_db()
    rows = conn.execute(
        'SELECT * FROM feedbacks ORDER BY created_at DESC'
    ).fetchall()
    conn.close()

    feedbacks = [dict(row) for row in rows]
    return jsonify(feedbacks), 200


# UPDATE – edit a feedback entry
@app.route('/api/feedback/<int:feedback_id>', methods=['PUT'])
def update_feedback(feedback_id):
    password = request.headers.get('X-Admin-Password', '')
    if password != ADMIN_PASSWORD:
        return jsonify({'error': 'Unauthorized'}), 401

    data    = request.get_json()
    name    = data.get('name', '').strip()
    event   = data.get('event', '').strip()
    message = data.get('message', '').strip()

    if not name or not event or not message:
        return jsonify({'error': 'All fields are required.'}), 400

    conn = get_db()
    result = conn.execute(
        'UPDATE feedbacks SET name=?, event=?, message=? WHERE id=?',
        (name, event, message, feedback_id)
    )
    conn.commit()
    conn.close()

    if result.rowcount == 0:
        return jsonify({'error': 'Feedback not found.'}), 404

    return jsonify({'message': 'Feedback updated successfully!'}), 200


# DELETE – remove a feedback entry
@app.route('/api/feedback/<int:feedback_id>', methods=['DELETE'])
def delete_feedback(feedback_id):
    password = request.headers.get('X-Admin-Password', '')
    if password != ADMIN_PASSWORD:
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_db()
    result = conn.execute(
        'DELETE FROM feedbacks WHERE id=?', (feedback_id,)
    )
    conn.commit()
    conn.close()

    if result.rowcount == 0:
        return jsonify({'error': 'Feedback not found.'}), 404

    return jsonify({'message': 'Feedback deleted successfully!'}), 200


# ============================================================
# MAIN
# ============================================================

if __name__ == '__main__':
    init_db()                        # create DB/table on startup
    app.run(debug=True, port=5000)   # visit http://127.0.0.1:5000
