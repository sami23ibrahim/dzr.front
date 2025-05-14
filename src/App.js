import React, { useState, useEffect } from "react";
import axios from "axios";
import './App.css';
import Lottie from "lottie-react";

// Set the backend API base URL
const API_BASE_URL = 'https://dzr-backend.onrender.com';

function App() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [activeRows, setActiveRows] = useState([]);
  const [archivedRows, setArchivedRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('active'); // 'active' or 'archived'
  const [notesPopup, setNotesPopup] = useState({ open: false, row: null, value: "" });
  const [searchField, setSearchField] = useState("Name");
  const [searchValue, setSearchValue] = useState("");
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [noDataMessage, setNoDataMessage] = useState("");
  const [loadingAnimData, setLoadingAnimData] = useState(null);
  const [archivePopup, setArchivePopup] = useState({ open: false, row: null, doctor: '', result: '' });
  const [colorFilter, setColorFilter] = useState('');

  // Map internal doctor values to display names
  const doctorDisplayNames = {
    "Dr. A": "Dr. Hakam",
    "Dr. B": "Dr. Fabian",
    "Dr. C": "Dr. Prabh"
  };

  // Fetch all rows from backend on load
  useEffect(() => {
    fetchRows();
  }, []);

  useEffect(() => {
    fetch(process.env.PUBLIC_URL + "/loading.json")
      .then(res => res.json())
      .then(setLoadingAnimData);
  }, []);

  const fetchRows = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/rows`);
      setActiveRows(res.data.active);
      setArchivedRows(res.data.archived);
    } catch (err) {
      alert("Failed to fetch data from backend.");
      console.error(err);
    }
  };

  // Merge new files into selectedFiles, avoiding duplicates by name+size
  const addFiles = (files) => {
    setSelectedFiles((prev) => {
      const fileMap = new Map(prev.map(f => [f.name + f.size, f]));
      for (let file of files) {
        fileMap.set(file.name + file.size, file);
      }
      return Array.from(fileMap.values());
    });
  };

  const handleFileChange = (e) => {
    // Add new files to the existing selectedFiles, avoiding duplicates
    const newFiles = Array.from(e.target.files);
    setSelectedFiles(prev => {
      const fileMap = new Map(prev.map(f => [f.name + f.size, f]));
      for (let file of newFiles) {
        fileMap.set(file.name + file.size, file);
      }
      return Array.from(fileMap.values());
    });
    e.target.value = null;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleRemoveFile = (idx) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (!selectedFiles.length) return;
    setLoading(true);
    setNoDataMessage("");
    const formData = new FormData();
    for (let file of selectedFiles) {
      formData.append("files", file);
    }
    try {
      const res = await axios.post(`${API_BASE_URL}/api/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // AI error handling
      if (res.data && res.data.ai_error) {
        setNoDataMessage("Your AI helper is tired, please ask Sami for help.");
        setLoading(false);
        return;
      }

      // Get all existing Ihre Rechnungs-Nr. from both tables
      const existingNumbers = new Set([
        ...activeRows.map(row => row["Ihre Rechnungs-Nr."]),
        ...archivedRows.map(row => row["Ihre Rechnungs-Nr."])
      ]);

      // Also track numbers in the current upload batch
      const uniqueNewRows = [];
      const seenInBatch = new Set();

      for (const row of res.data.data) {
        const nr = row["Ihre Rechnungs-Nr."];
        if (!existingNumbers.has(nr) && !seenInBatch.has(nr)) {
          uniqueNewRows.push(row);
          seenInBatch.add(nr);
        }
      }

      setActiveRows(prev => [...prev, ...uniqueNewRows]);
      setSelectedFiles([]); // Clear after upload
      await fetchRows(); // Optionally, always re-fetch to stay in sync
      if (res.data.invalid_files && res.data.invalid_files.length > 0) {
        setNoDataMessage(res.data.invalid_files);
      } else {
        setNoDataMessage("");
      }
    } catch (err) {
      alert("Upload failed. See console for details.");
      console.error(err);
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/row/${id}`);
      await fetchRows();
    } catch (err) {
      alert("Failed to delete row.");
      console.error(err);
    }
  };

  const handleUnarchive = async (id) => {
    try {
      await axios.post(`${API_BASE_URL}/api/row/${id}/unarchive`);
      await fetchRows();
    } catch (err) {
      alert("Failed to retrieve row.");
      console.error(err);
    }
  };

  // Notes popup handlers
  const handleOpenNotes = (row) => {
    setNotesPopup({ open: true, row, value: row.notes || "" });
  };

  const handleSaveNotes = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/row/${notesPopup.row.id}/notes`, { notes: notesPopup.value });
      setNotesPopup({ open: false, row: null, value: "" });
      await fetchRows();
    } catch (err) {
      alert("Failed to save notes.");
      console.error(err);
    }
  };

  // Starred toggle handler
  const handleToggleStarred = async (row) => {
    try {
      await axios.post(`${API_BASE_URL}/api/row/${row.id}/starred`, { starred: !row.starred });
      await fetchRows();
    } catch (err) {
      alert("Failed to update star.");
      console.error(err);
    }
  };

  // Replace rowsToDisplay logic with search filter and starred filter
  const allRows = view === 'active' ? activeRows : archivedRows;
  let rowsToDisplay = searchValue
    ? allRows.filter(row =>
        (row[searchField] || "")
          .toString()
          .toLowerCase()
          .includes(searchValue.toLowerCase())
      )
    : allRows;
  if (showStarredOnly) {
    rowsToDisplay = rowsToDisplay.filter(row => row.starred);
  }
  // Color filter for archived rows
  if (view === 'archived' && colorFilter) {
    rowsToDisplay = rowsToDisplay.filter(row => row.archive_result === colorFilter);
  }

  // Helper to parse European-formatted Betrag values
  const parseBetrag = val => {
    if (!val) return 0;
    let str = val.toString().replace(/[^\d,.-]/g, ''); // keep digits, comma, dot, minus
    str = str.replace(/\./g, ''); // remove thousands separator
    str = str.replace(/,/g, '.'); // replace decimal comma with dot
    return parseFloat(str) || 0;
  };

  // Helper to format Betrag with sign and color for archived rows
  const formatBetrag = (row) => {
    const val = parseBetrag(row["Betrag"]);
    if (view === 'archived' && row.archive_result === 'green') {
      return <span style={{ color: 'green' }}>+{Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
    }
    return <span style={{ color: 'red' }}>{val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
  };

  return (
    <>
      {loading && loadingAnimData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(255,255,255,0.7)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}>
          <div style={{
            fontFamily: '"Baloo 2", "Montserrat", "Oswald", "Arial Black", Arial, sans-serif',
            fontWeight: 800,
            fontSize: '3.2em',
            borderRadius: '32px',
            letterSpacing: '0.04em',
            marginBottom: 40,
            marginTop: '-80px',
            userSelect: 'none',
            background: 'none',
            backgroundImage: 'linear-gradient(90deg, #2563eb 0%, #00c6fb 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 4px 24px #2563eb22',
            textAlign: 'center',
            filter: 'drop-shadow(0 2px 8px #00c6fb33)',
            padding: '0.1em 0.3em',
          }}>
            hang on <span style={{fontWeight: 900, letterSpacing: '0.06em'}}>MY LOFE</span> we are working on it
          </div>
          <Lottie animationData={loadingAnimData} style={{ width: 140, height: 140 }} loop={true} />
        </div>
      )}
      {view === 'active' && (
        <div className="upload-section">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            style={{
              border: "2px dashed #aaa",
              borderRadius: 8,
              padding: 20,
              marginBottom: 10,
              background: "#fafafa",
              textAlign: "center",
              color: "#888"
            }}
          >
            Drag & drop PDF files here
          </div>
          <button
            onClick={() => document.getElementById("fileInput").click()}
            style={{ marginBottom: 10 }}
          >
            Browse Files
          </button>
          <input
            id="fileInput"
            type="file"
            multiple
            accept="application/pdf"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          {selectedFiles.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <b>Files to upload:</b>
              <ul>
                {selectedFiles.map((file, idx) => (
                  <li key={file.name + file.size} style={{ display: "flex", alignItems: "center" }}>
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    <button
                      style={{ marginLeft: 8, color: "red", cursor: "pointer" }}
                      onClick={() => handleRemoveFile(idx)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={handleUpload} disabled={loading || !selectedFiles.length} style={{ marginBottom: 0 }}>
            {loading ? "Processing..." : "Upload & Extract"}
          </button>
          {noDataMessage && typeof noDataMessage === 'string' && (
            <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginTop: 12, fontWeight: 500, fontSize: '1.05em' }}>
              {noDataMessage}
            </div>
          )}
          {Array.isArray(noDataMessage) && noDataMessage.length > 0 && (
            <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginTop: 12, fontWeight: 500, fontSize: '1.05em' }}>
              No invoice data was found in the following file(s):
              <ul style={{ margin: '8px 0 0 18px', padding: 0 }}>
                {noDataMessage.map((fname, idx) => (
                  <li key={fname + idx}>{fname}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="app-container" style={{ position: 'relative' }}>
        <div className="toggle-switch">
          <button
            className={view === 'active' ? 'switch-btn active' : 'switch-btn'}
            onClick={() => { setView('active'); setSearchValue(""); }}
          >
            Active
          </button>
          <button
            className={view === 'archived' ? 'switch-btn active' : 'switch-btn'}
            onClick={() => { setView('archived'); setSearchValue(""); }}
          >
            Archived
          </button>
        </div>
        <h2>DZR TOOL</h2>
        {/* Search bar */}
        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 8,color: "red" }}>
          <select value={searchField} onChange={e => setSearchField(e.target.value)}>
            <option value="Name">Name</option>
            <option value="Rechnungs-Nr. DZR">Rechnungs-Nr. DZR</option>
            <option value="Ihre Rechnungs-Nr.">Ihre Rechnungs-Nr.</option>
            <option value="Billing Date">Billing Date</option>
          </select>
          <input
            type="text"
            placeholder={`Search by ${searchField}`}
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            style={{ flex: 1, padding: 4 }}
          />
          <button onClick={() => setSearchValue("")}>Clear</button>
          <label style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
            <input
              type="checkbox"
              checked={showStarredOnly}
              onChange={e => setShowStarredOnly(e.target.checked)}
            />
            <span style={{ color: "gold", fontSize: "1.2em" }}>★</span> Only Starred
          </label>
        </div>
        {/* Color filter for archived view */}
        {view === 'archived' && (
          <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 500 }}>Filter by Result:</span>
            <button
              style={{ background: colorFilter === 'red' ? 'red' : '#eee', color: colorFilter === 'red' ? 'white' : 'red', borderRadius: 8, padding: '2px 12px', border: 'none', fontWeight: 600 }}
              onClick={() => setColorFilter('red')}
            >Loss</button>
            <button
              style={{ background: colorFilter === 'green' ? 'green' : '#eee', color: colorFilter === 'green' ? 'white' : 'green', borderRadius: 8, padding: '2px 12px', border: 'none', fontWeight: 600 }}
              onClick={() => setColorFilter('green')}
            >Gain</button>
            <button
              style={{ background: colorFilter === 'orange' ? 'orange' : '#eee', color: colorFilter === 'orange' ? 'white' : 'orange', borderRadius: 8, padding: '2px 12px', border: 'none', fontWeight: 600 }}
              onClick={() => setColorFilter('orange')}
            >No Answer</button>
            <button
              style={{ background: colorFilter === '' ? '#2563eb' : '#eee', color: colorFilter === '' ? 'white' : 'black', borderRadius: 8, padding: '2px 12px', border: 'none', fontWeight: 600 }}
              onClick={() => setColorFilter('')}
            >All</button>
          </div>
        )}
      </div>
      {/* Betrag total card at top right for active view */}
      {view === 'active' && rowsToDisplay.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 32,
          right: 48,
          background: '#f8fafc',
          borderRadius: 16,
          boxShadow: '0 4px 24px #0002',
          padding: '18px 36px',
          fontWeight: 800,
          color: 'red',
          fontSize: '1.18em',
          letterSpacing: '0.01em',
          fontFamily: 'inherit',
          zIndex: 10
        }}>
          Total: {rowsToDisplay.reduce((sum, row) => sum + parseBetrag(row["Betrag"]), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      )}
      {/* Three summary cards for archived view, one for each result color */}
      {view === 'archived' && rowsToDisplay.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 32,
          right: 48,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          zIndex: 10
        }}>
          {/* Loss (red) */}
          <div style={{
            background: '#f8fafc',
            borderRadius: 16,
            boxShadow: '0 4px 24px #0002',
            padding: '16px 28px',
            fontWeight: 800,
            color: 'red',
            fontSize: '1.08em',
            minWidth: 120,
            textAlign: 'center'
          }}>
            Loss: {archivedRows.filter(r => r.archive_result === 'red').reduce((sum, row) => sum + parseBetrag(row["Betrag"]), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          {/* Gain (green) */}
          <div style={{
            background: '#f8fafc',
            borderRadius: 16,
            boxShadow: '0 4px 24px #0002',
            padding: '16px 28px',
            fontWeight: 800,
            color: 'green',
            fontSize: '1.08em',
            minWidth: 120,
            textAlign: 'center'
          }}>
            Gain: +{Math.abs(archivedRows.filter(r => r.archive_result === 'green').reduce((sum, row) => sum + parseBetrag(row["Betrag"]), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          {/* No Answer (orange) */}
          <div style={{
            background: '#f8fafc',
            borderRadius: 16,
            boxShadow: '0 4px 24px #0002',
            padding: '16px 28px',
            fontWeight: 800,
            color: 'orange',
            fontSize: '1.08em',
            minWidth: 120,
            textAlign: 'center'
          }}>
            No Answer: {archivedRows.filter(r => r.archive_result === 'orange').reduce((sum, row) => sum + parseBetrag(row["Betrag"]), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      )}
      {rowsToDisplay.length > 0 && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Rechnungsempfängers</th>
                <th>Rechnungs-Nr. DZR</th>
                <th>Ihre Rechnungs-Nr.</th>
                <th>Betrag</th>
                <th>Billing Date</th>
                {view === 'active' ? (
                  <th>Assigned To</th>
                ) : (
                  <th>Handled By</th>
                )}
                <th>Notes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rowsToDisplay.map((row, idx) => (
                <tr key={row.id || idx}>
                  <td>
                    <span
                      className={`star-icon${row.starred ? ' starred' : ''}`}
                      title={row.starred ? "Unstar" : "Star"}
                      onClick={() => handleToggleStarred(row)}
                    >★</span>
                  </td>
                  <td>{row["Name"]}</td>
                  <td>{row["Rechnungsempfängers"]}</td>
                  <td>{row["Rechnungs-Nr. DZR"]}</td>
                  <td>{row["Ihre Rechnungs-Nr."]}</td>
                  <td>{formatBetrag(row)}</td>
                  <td>{row["Billing Date"]}</td>
                  {view === 'active' ? (
                    <td>
                      <select
                        value={row.assigned_to || ''}
                        onChange={async (e) => {
                          const newValue = e.target.value;
                          setActiveRows(prev => prev.map(r => r.id === row.id ? { ...r, assigned_to: newValue } : r));
                          try {
                            await axios.post(`${API_BASE_URL}/api/row/${row.id}/assigned_to`, { assigned_to: newValue });
                          } catch (err) {
                            alert('Failed to update assignment.');
                            console.error(err);
                          }
                        }}
                      >
                        <option value=""></option>
                        <option value="Dr. A">Dr. Hakam</option>
                        <option value="Dr. B">Dr. Fabian</option>
                        <option value="Dr. C">Dr. Prabh</option>
                      </select>
                    </td>
                  ) : (
                    <td>{doctorDisplayNames[row.handled_by] || row.handled_by || ''}</td>
                  )}
                  <td>
                    <button className="notes-btn" onClick={() => handleOpenNotes(row)}>
                      {row.notes && row.notes.length > 0 ? "📝" : "Add"}
                    </button>
                  </td>
                  <td>
                    {view === 'active' && (
                      <>
                        <button onClick={() => setArchivePopup({ open: true, row, doctor: '', result: '' })}>Archive</button>
                        <button style={{ marginLeft: 8, color: "red" }} onClick={() => handleDelete(row.id)}>Delete</button>
                      </>
                    )}
                    {view === 'archived' && (
                      <>
                        <button onClick={() => handleUnarchive(row.id)}>Retrieve</button>
                        <button style={{ marginLeft: 8, color: "red" }} onClick={() => handleDelete(row.id)}>Delete</button>
                      </>
                    )}
                  </td>
                  {view === 'archived' && (
                    <td>
                      {row.archive_result && ['red', 'green', 'orange'].includes(row.archive_result) && (
                        <span
                          style={{
                            display: 'inline-block',
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            backgroundColor:
                              row.archive_result === 'red'
                                ? 'red'
                                : row.archive_result === 'green'
                                ? 'green'
                                : row.archive_result === 'orange'
                                ? 'orange'
                                : 'transparent',
                          }}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Notes Popup */}
      {notesPopup.open && (
        <div className="popup-overlay">
          <div className="popup-card">
            <h3>Edit Notes</h3>
            <textarea
              rows={6}
              value={notesPopup.value}
              onChange={e => setNotesPopup({ ...notesPopup, value: e.target.value })}
            />
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button onClick={() => setNotesPopup({ open: false, row: null, value: "" })} style={{ marginRight: 8 }}>Cancel</button>
              <button onClick={handleSaveNotes}>Save</button>
            </div>
          </div>
        </div>
      )}
      {/* Archive Popup Modal */}
      {archivePopup.open && (
        <div className="popup-overlay">
          <div className="popup-card">
            <h3>Archive Row</h3>
            <div style={{ marginBottom: 12 }}>
              <label><b>Assign to Doctor:</b></label><br />
              <select
                value={archivePopup.doctor}
                onChange={e => setArchivePopup(p => ({ ...p, doctor: e.target.value }))}
                style={{ width: '100%', marginBottom: 10 }}
              >
                <option value="">-- Select Doctor --</option>
                <option value="Dr. A">Dr. Hakam</option>
                <option value="Dr. B">Dr. Fabian</option>
                <option value="Dr. C">Dr. Prabh</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label><b>Result:</b></label><br />
              <select
                value={archivePopup.result}
                onChange={e => setArchivePopup(p => ({ ...p, result: e.target.value }))}
                style={{ width: '100%' }}
              >
                <option value="">-- Select Result --</option>
                <option value="red">🔴 Loss</option>
                <option value="orange">🟠 No Answer</option>
                <option value="green">🟢 Gain</option>
              </select>
            </div>
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <button onClick={() => setArchivePopup({ open: false, row: null, doctor: '', result: '' })} style={{ marginRight: 8 }}>Cancel</button>
              <button
                disabled={!archivePopup.doctor || !archivePopup.result}
                onClick={async () => {
                  const row = archivePopup.row;
                  // 1. Update assigned_to
                  await axios.post(`${API_BASE_URL}/api/row/${row.id}/assigned_to`, { assigned_to: archivePopup.doctor });
                  // 2. Optionally store result color
                  try {
                    await axios.post(`${API_BASE_URL}/api/row/${row.id}/archive_result`, { result_color: archivePopup.result });
                  } catch (e) { /* ignore if endpoint doesn't exist */ }
                  // 3. Archive the row with correct headers and JSON body
                  try {
                    await axios.post(
                      `${API_BASE_URL}/api/row/${row.id}/archive`,
                      { archive_result: archivePopup.result },
                      { headers: { 'Content-Type': 'application/json' } }
                    );
                  } catch (err) {
                    alert('Failed to archive row.');
                    return;
                  }
                  setArchivePopup({ open: false, row: null, doctor: '', result: '' });
                  await fetchRows();
                }}
                style={{ background: (!archivePopup.doctor || !archivePopup.result) ? '#ccc' : '#2563eb', color: 'white', fontWeight: 600 }}
              >Archive</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
