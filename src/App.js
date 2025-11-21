import React, { useState, useEffect } from "react";
import axios from "axios";
import './App.css';
import Lottie from "lottie-react";

// Set the backend API base URL
const API_BASE_URL = 'https://dzr-backend.onrender.com';
//const API_BASE_URL = 'http://localhost:5000';

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
  const [doctorOptions, setDoctorOptions] = useState([]); // All unique doctors
  const [selectedDoctors, setSelectedDoctors] = useState([]); // Selected doctor values

  // Map internal doctor values to display names
  const doctorDisplayNames = {
    "Dr. A": "Dr. Hakam",
    "Dr. B": "Dr. Fabian",
    "Dr. C": "Dr. Prabh"
  };

  // Doctor filter logic
  const doctorCheckboxes = [
    { value: 'Dr. A', label: 'Dr. Hakam' },
    { value: 'Dr. B', label: 'Dr. Fabian' },
    { value: 'Dr. C', label: 'Dr. Prabh' },
  ];
  const [doctorMode, setDoctorMode] = useState('all'); // 'all' or 'custom'
  const [checkedDoctors, setCheckedDoctors] = useState([]); // array of doctor values

  // Manual entry modal state
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualEntryData, setManualEntryData] = useState({
    Name: '',
    'Rechnungsempfängers': '',
    'Rechnungs-Nr. DZR': '',
    'Ihre Rechnungs-Nr.': '',
    Betrag: '',
    'Billing Date': ''
  });
  const [manualEntryError, setManualEntryError] = useState('');
  const [manualEntryFieldErrors, setManualEntryFieldErrors] = useState({});
  const requiredFields = ['Name', 'Rechnungsempfängers', 'Rechnungs-Nr. DZR', 'Ihre Rechnungs-Nr.', 'Betrag', 'Billing Date'];

  // Edit entry modal state
  const [editEntryOpen, setEditEntryOpen] = useState(false);
  const [editEntryData, setEditEntryData] = useState(null); // { ...fields, id }
  const [editEntryError, setEditEntryError] = useState('');
  const [editEntryFieldErrors, setEditEntryFieldErrors] = useState({});

  // Edit archive result state
  const [editArchiveResultRow, setEditArchiveResultRow] = useState(null); // { id, current_result }
  
  // Debug: log when state changes
  useEffect(() => {
    console.log('editArchiveResultRow changed:', editArchiveResultRow);
  }, [editArchiveResultRow]);

  // Edit entry validation (reuse manualEntry validation)
  function validateEditEntry(data) {
    return validateManualEntry(data);
  }
  const editEntryFieldErrorsCurrent = editEntryData ? validateEditEntry(editEntryData) : {};
  const isEditEntryValid = editEntryData && Object.keys(editEntryFieldErrorsCurrent).length === 0;

  // Field validation
  function validateManualEntry(data) {
    const errors = {};
    // Name
    if (!data.Name.trim()) errors.Name = 'Required';
    // Rechnungsempfängers
    if (!data['Rechnungsempfängers'].trim()) errors['Rechnungsempfängers'] = 'Required';
    // Rechnungs-Nr. DZR: only digits and /
    if (!data['Rechnungs-Nr. DZR'].trim()) {
      errors['Rechnungs-Nr. DZR'] = 'Required';
    } else if (!/^\d+(\/\d+)*$/.test(data['Rechnungs-Nr. DZR'].replace(/\s+/g, ''))) {
      errors['Rechnungs-Nr. DZR'] = 'Only digits and / allowed (e.g. 123456/01/2024)';
    }
    // Ihre Rechnungs-Nr.
    if (!data['Ihre Rechnungs-Nr.'].trim()) errors['Ihre Rechnungs-Nr.'] = 'Required';
    // Betrag: must be a valid number (allow negative, decimal, comma or dot)
    if (!data.Betrag.trim()) {
      errors.Betrag = 'Required';
    } else {
      // Accept both dot and comma as decimal separator
      const normalized = data.Betrag.replace(',', '.');
      if (isNaN(normalized) || !/^[-]?\d+(\.|,)?\d*$/.test(data.Betrag)) {
        errors.Betrag = 'Must be a valid number (e.g. -123.45)';
      }
    }
    // Billing Date: strict DD.MM.YYYY
    if (!data['Billing Date'].trim()) {
      errors['Billing Date'] = 'Required';
    } else if (!/^\d{2}\.\d{2}\.\d{4}$/.test(data['Billing Date'])) {
      errors['Billing Date'] = 'Format must be DD.MM.YYYY (e.g. 01.01.2024)';
    }
    return errors;
  }

  const manualEntryFieldErrorsCurrent = validateManualEntry(manualEntryData);
  const isManualEntryValid = Object.keys(manualEntryFieldErrorsCurrent).length === 0;

  // Fetch all rows from backend on load or when doctor filter changes
  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line
  }, [view, doctorMode, checkedDoctors]);

  useEffect(() => {
    fetch(process.env.PUBLIC_URL + "/loading.json")
      .then(res => res.json())
      .then(setLoadingAnimData);
  }, []);

  // Close archive result editor when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (editArchiveResultRow && !e.target.closest('[data-archive-result-editor]')) {
        setEditArchiveResultRow(null);
      }
    };
    if (editArchiveResultRow) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [editArchiveResultRow]);

  const fetchRows = async () => {
    try {
      let url = `${API_BASE_URL}/api/rows`;
      if (view === 'active') {
        if (doctorMode === 'custom' && checkedDoctors.length > 0) {
          url += `?assigned_to=${checkedDoctors.join(',')}`;
        }
        // If doctorMode is 'all', do not add assigned_to param
      }
      const res = await axios.get(url);
      setActiveRows(res.data.active);
      setArchivedRows(res.data.archived);
      // Extract unique doctor values from activeRows (for filter UI)
      if (view === 'active') {
        const allDoctors = Array.from(new Set([
          ...res.data.active.map(row => row.assigned_to).filter(Boolean)
        ]));
        setDoctorOptions(allDoctors);
        // If no selection yet, select all by default
        if (selectedDoctors.length === 0 && allDoctors.length > 0) {
          setSelectedDoctors(allDoctors);
        }
      }
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

      // --- Updated invalid_files handling ---
      const grouped = Array.isArray(res.data.invalid_files)
  ? res.data.invalid_files.reduce((acc, file) => {
      if (!acc[file.reason]) acc[file.reason] = [];
      acc[file.reason].push(file.filename);
      return acc;
    }, {})
  : {};

let manualReviewList = [];
if (Array.isArray(res.data.incomplete_entries_with_names) && res.data.incomplete_entries_with_names.length > 0) {
  manualReviewList = res.data.incomplete_entries_with_names;
}

setNoDataMessage({ ...grouped, manualReviewList });

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

  // Handle archive result change
  const handleArchiveResultChange = async (rowId, newResult) => {
    try {
      await axios.post(`${API_BASE_URL}/api/row/${rowId}/archive_result`, { archive_result: newResult });
      setEditArchiveResultRow(null);
      await fetchRows();
    } catch (err) {
      alert('Failed to update archive result.');
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
            hang on <span style={{fontWeight: 900, letterSpacing: '0.06em'}}>tight</span> we are working on it
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
       {/* Show grouped invalid_files messages and manual review names */}
{noDataMessage && typeof noDataMessage === 'object' && (
  <div style={{
    color: '#b91c1c',
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    padding: '10px 14px 10px 14px',
    paddingRight: '32px',    // ADD extra right padding for the close button
    marginTop: 12,
    fontWeight: 500,
    fontSize: '1.05em',
    position: 'relative'
  }}>
    {/* Close button */}
    <button
      onClick={() => setNoDataMessage("")}
      style={{
        position: 'absolute',
        top: 8,
        right: 8,  // Use 8 for symmetry and to match the padding
        background: 'none',
        border: 'none',
        fontSize: '1.25em', // Slightly larger for visibility
        color: '#b91c1c',
        cursor: 'pointer',
        fontWeight: 700,
        lineHeight: 1,
        zIndex: 2,
        padding: 0
      }}
      aria-label="Close"
      title="Close"
    >✕</button>
  
    {noDataMessage["no_data"] && (
      <div style={{ marginBottom: noDataMessage["incomplete_entry"] ? 10 : 0 }}>
        No invoice data was found in the following file(s):
        <ul style={{ margin: '8px 0 0 18px', padding: 0 }}>
          {noDataMessage["no_data"].map((fname, idx) => (
            <li key={fname + idx}>{fname}</li>
          ))}
        </ul>
      </div>
    )}
    {noDataMessage["incomplete_entry"] && (
      <div>
        The following files may contain corrupted data. Please handle them manually:
        <ul style={{ margin: '8px 0 0 18px', padding: 0 }}>
          {noDataMessage["incomplete_entry"].map((fname, idx) => (
            <li key={fname + idx}>{fname}</li>
          ))}
        </ul>
      </div>
    )}
    {noDataMessage.manualReviewList && noDataMessage.manualReviewList.length > 0 && (
      <div style={{ marginTop: 10 }}>
        <b>Manual review needed for these file(s):</b>
        <ul style={{ margin: '8px 0 0 18px', padding: 0 }}>
          {noDataMessage.manualReviewList.map((item, idx) => (
            <li key={item.filename + idx}>
              {item.filename}
              {item.added_names && item.added_names.length > 0 && (
                <div style={{ marginLeft: 10, color: '#64748b', fontSize: '0.97em' }}>
                  Added entries:
                  <ul style={{ marginTop: 4 }}>
                    {item.added_names.map((name, nidx) => (
                      <li key={name + nidx}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    )}
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
        <h2>DZR x D3Z</h2>
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
        {/* Doctor filter for active view */}
        {view === 'active' && (
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontWeight: 500 }}>Filter by Doctor:</span>
            {/* All checkbox */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={doctorMode === 'all'}
                onChange={e => {
                  if (e.target.checked) {
                    setDoctorMode('all');
                    setCheckedDoctors([]);
                  }
                }}
              />
              All
            </label>
            {/* Doctor checkboxes */}
            {doctorCheckboxes.map(doc => (
              <label key={doc.value} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={doctorMode === 'custom' && checkedDoctors.includes(doc.value)}
                  onChange={e => {
                    let newChecked;
                    if (e.target.checked) {
                      newChecked = [...checkedDoctors, doc.value];
                    } else {
                      newChecked = checkedDoctors.filter(d => d !== doc.value);
                    }
                    if (newChecked.length === 0) {
                      setDoctorMode('all');
                      setCheckedDoctors([]);
                    } else {
                      setDoctorMode('custom');
                      setCheckedDoctors(newChecked);
                    }
                  }}
                />
                {doc.label}
              </label>
            ))}
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
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2, marginLeft: 8, gap: 18 }}>
            <button
              style={{
                color: '#2563eb',
                background: 'none',
                border: 'none',
                fontWeight: 700,
                fontSize: '1em',
                height: 'auto',
                padding: 0,
                cursor: 'pointer',
                marginRight: 10
              }}
              onClick={() => { setManualEntryOpen(true); setManualEntryError(''); }}
            >
              + Add Entry
            </button>
            <span style={{ fontSize: '0.97em', color: '#888', fontWeight: 400 }}>
              {view === 'active'
                ? `${activeRows.length} entries`
                : `${archivedRows.length} entries`}
            </span>
          </div>
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
                  <td style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {row["Name"]}
                    <span
                      style={{ cursor: 'pointer', color: '#2563eb', fontSize: '1.1em', marginLeft: 4 }}
                      title="Edit Entry"
                      onClick={() => {
                        setEditEntryData({
                          id: row.id,
                          Name: row["Name"] || '',
                          'Rechnungsempfängers': row["Rechnungsempfängers"] || '',
                          'Rechnungs-Nr. DZR': row["Rechnungs-Nr. DZR"] || '',
                          'Ihre Rechnungs-Nr.': row["Ihre Rechnungs-Nr."] || '',
                          Betrag: row["Betrag"] || '',
                          'Billing Date': row["Billing Date"] || ''
                        });
                        setEditEntryError('');
                        setEditEntryOpen(true);
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.85 2.85a1.2 1.2 0 0 1 1.7 1.7l-1.1 1.1-1.7-1.7 1.1-1.1Zm-2.1 2.1 1.7 1.7-8.1 8.1c-.13.13-.23.3-.27.48l-.4 2.1a.5.5 0 0 0 .6.6l2.1-.4c.18-.04.35-.14.48-.27l8.1-8.1-1.7-1.7-8.1 8.1c-.13.13-.23.3-.27.48l-.4 2.1a.5.5 0 0 0 .6.6l2.1-.4c.18-.04.35-.14.48-.27l8.1-8.1Z" fill="#2563eb"/></svg>
                    </span>
                  </td>
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
                      {row.archive_result && ['red', 'green', 'orange'].includes(row.archive_result) ? (
                        <div style={{ position: 'relative' }}>
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
                              cursor: 'pointer',
                              border: '2px solid transparent',
                              transition: 'border 0.2s'
                            }}
                            title="Click to edit result"
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('Clicked archive result for row:', row.id);
                              setEditArchiveResultRow({ id: row.id, current_result: row.archive_result });
                            }}
                            onMouseEnter={e => e.target.style.border = '2px solid #2563eb'}
                            onMouseLeave={e => e.target.style.border = '2px solid transparent'}
                          />
                          {editArchiveResultRow && editArchiveResultRow.id === row.id && (
                            <div 
                              data-archive-result-editor
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                zIndex: 100,
                                background: 'white',
                                border: '1px solid #e0e0e0',
                                borderRadius: 8,
                                padding: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6,
                                minWidth: 120
                              }}>
                              <button
                                style={{ background: '#fee', color: 'red', border: '1px solid red', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}
                                onClick={() => handleArchiveResultChange(row.id, 'red')}
                              >
                                🔴 Loss
                              </button>
                              <button
                                style={{ background: '#efe', color: 'green', border: '1px solid green', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}
                                onClick={() => handleArchiveResultChange(row.id, 'green')}
                              >
                                🟢 Gain
                              </button>
                              <button
                                style={{ background: '#ffedd5', color: 'orange', border: '1px solid orange', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}
                                onClick={() => handleArchiveResultChange(row.id, 'orange')}
                              >
                                🟠 No Answer
                              </button>
                              <button
                                style={{ background: '#f5f5f5', color: '#666', border: '1px solid #ccc', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', textAlign: 'left', marginTop: 4 }}
                                onClick={() => setEditArchiveResultRow(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      ) : null}
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
      {/* Manual Entry Modal */}
      {manualEntryOpen && (
        <div className="popup-overlay">
          <div className="popup-card" style={{ minWidth: 540, maxWidth: 700 }}>
            <h3>Add Manual Invoice Entry</h3>
            <form onSubmit={async e => {
              e.preventDefault();
              setManualEntryError('');
              setManualEntryFieldErrors(manualEntryFieldErrorsCurrent);
              if (!isManualEntryValid) {
                setManualEntryError('Please fill all required fields correctly.');
                return;
              }
              try {
                const res = await axios.post(`${API_BASE_URL}/api/manual_entry`, manualEntryData);
                if (res.data && res.data.success) {
                  setManualEntryOpen(false);
                  setManualEntryData({
                    Name: '',
                    'Rechnungsempfängers': '',
                    'Rechnungs-Nr. DZR': '',
                    'Ihre Rechnungs-Nr.': '',
                    Betrag: '',
                    'Billing Date': ''
                  });
                  setManualEntryFieldErrors({});
                  await fetchRows();
                } else {
                  setManualEntryError(res.data && res.data.error ? res.data.error : 'Unknown error.');
                }
              } catch (err) {
                setManualEntryError('Failed to add entry. Please check your input and try again.');
              }
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label>
                  Name*<br />
                  <input type="text" value={manualEntryData.Name} onChange={e => setManualEntryData(d => ({ ...d, Name: e.target.value }))} required />
                  {manualEntryFieldErrorsCurrent.Name && <span style={{ color: '#b91c1c', fontSize: '0.97em' }}>{manualEntryFieldErrorsCurrent.Name}</span>}
                </label>
                <label>
                  Rechnungsempfängers*<br />
                  <input type="text" value={manualEntryData['Rechnungsempfängers']} onChange={e => setManualEntryData(d => ({ ...d, 'Rechnungsempfängers': e.target.value }))} required />
                  {manualEntryFieldErrorsCurrent['Rechnungsempfängers'] && <span style={{ color: '#b91c1c', fontSize: '0.97em' }}>{manualEntryFieldErrorsCurrent['Rechnungsempfängers']}</span>}
                </label>
                <label>
                  Rechnungs-Nr. DZR*<br />
                  <input
                    type="text"
                    value={manualEntryData['Rechnungs-Nr. DZR']}
                    onChange={e => {
                      // Only allow digits and /
                      const val = e.target.value.replace(/[^\d\/]/g, '');
                      setManualEntryData(d => ({ ...d, 'Rechnungs-Nr. DZR': val }));
                    }}
                    required
                  />
                  {manualEntryFieldErrorsCurrent['Rechnungs-Nr. DZR'] && <span style={{ color: '#b91c1c', fontSize: '0.97em' }}>{manualEntryFieldErrorsCurrent['Rechnungs-Nr. DZR']}</span>}
                </label>
                <label>
                  Ihre Rechnungs-Nr.*<br />
                  <input type="text" value={manualEntryData['Ihre Rechnungs-Nr.']} onChange={e => setManualEntryData(d => ({ ...d, 'Ihre Rechnungs-Nr.': e.target.value }))} required />
                  {manualEntryFieldErrorsCurrent['Ihre Rechnungs-Nr.'] && <span style={{ color: '#b91c1c', fontSize: '0.97em' }}>{manualEntryFieldErrorsCurrent['Ihre Rechnungs-Nr.']}</span>}
                </label>
                <label>
                  Betrag*<br />
                  <input
                    type="text"
                    value={manualEntryData.Betrag}
                    onChange={e => setManualEntryData(d => ({ ...d, Betrag: e.target.value }))}
                    required
                  />
                  {manualEntryFieldErrorsCurrent.Betrag && <span style={{ color: '#b91c1c', fontSize: '0.97em' }}>{manualEntryFieldErrorsCurrent.Betrag}</span>}
                </label>
                <label>
                  Billing Date*<br />
                  <input
                    type="text"
                    value={manualEntryData['Billing Date']}
                    onChange={e => {
                      // Only allow numbers and .
                      let val = e.target.value.replace(/[^\d\.]/g, '');
                      // Enforce max length 10 (DD.MM.YYYY)
                      if (val.length > 10) val = val.slice(0, 10);
                      setManualEntryData(d => ({ ...d, 'Billing Date': val }));
                    }}
                    maxLength={10}
                    placeholder="DD.MM.YYYY"
                    required
                  />
                  {manualEntryFieldErrorsCurrent['Billing Date'] && <span style={{ color: '#b91c1c', fontSize: '0.97em' }}>{manualEntryFieldErrorsCurrent['Billing Date']}</span>}
                </label>
                {manualEntryError && <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', fontWeight: 500 }}>{manualEntryError}</div>}
              </div>
              <div style={{ marginTop: 18, textAlign: 'right' }}>
                <button type="button" onClick={() => setManualEntryOpen(false)} style={{ marginRight: 8 }}>Cancel</button>
                <button type="submit" disabled={!isManualEntryValid} style={{ background: isManualEntryValid ? '#2563eb' : '#ccc', color: 'white', fontWeight: 600 }}>
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Entry Modal */}
      {editEntryOpen && editEntryData && (
        <div className="popup-overlay">
          <div className="popup-card" style={{ minWidth: 540, maxWidth: 700 }}>
            <h3>Edit Invoice Entry</h3>
            <form onSubmit={async e => {
              e.preventDefault();
              setEditEntryError('');
              setEditEntryFieldErrors(editEntryFieldErrorsCurrent);
              if (!isEditEntryValid) {
                setEditEntryError('Please fill all required fields correctly.');
                return;
              }
              try {
                const res = await axios.post(`${API_BASE_URL}/api/row/${editEntryData.id}/edit`, editEntryData);
                if (res.data && res.data.success) {
                  setEditEntryOpen(false);
                  setEditEntryData(null);
                  setEditEntryFieldErrors({});
                  await fetchRows();
                } else {
                  setEditEntryError(res.data && res.data.error ? res.data.error : 'Unknown error.');
                }
              } catch (err) {
                setEditEntryError('Failed to update entry. Please check your input and try again.');
              }
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label>
                  Name*<br />
                  <input type="text" value={editEntryData.Name} onChange={e => setEditEntryData(d => ({ ...d, Name: e.target.value }))} required />
                  {editEntryFieldErrorsCurrent.Name && <span style={{ color: '#b91c1c', fontSize: '0.97em' }}>{editEntryFieldErrorsCurrent.Name}</span>}
                </label>
                <label>
                  Rechnungsempfängers*<br />
                  <input type="text" value={editEntryData['Rechnungsempfängers']} onChange={e => setEditEntryData(d => ({ ...d, 'Rechnungsempfängers': e.target.value }))} required />
                  {editEntryFieldErrorsCurrent['Rechnungsempfängers'] && <span style={{ color: '#b91c1c', fontSize: '0.97em' }}>{editEntryFieldErrorsCurrent['Rechnungsempfängers']}</span>}
                </label>
                <label>
                  Rechnungs-Nr. DZR*<br />
                  <input
                    type="text"
                    value={editEntryData['Rechnungs-Nr. DZR']}
                    onChange={e => {
                      // Only allow digits and /
                      const val = e.target.value.replace(/[^\d\/]/g, '');
                      setEditEntryData(d => ({ ...d, 'Rechnungs-Nr. DZR': val }));
                    }}
                    required
                  />
                  {editEntryFieldErrorsCurrent['Rechnungs-Nr. DZR'] && <span style={{ color: '#b91c1c', fontSize: '0.97em' }}>{editEntryFieldErrorsCurrent['Rechnungs-Nr. DZR']}</span>}
                </label>
                <label>
                  Ihre Rechnungs-Nr.*<br />
                  <input type="text" value={editEntryData['Ihre Rechnungs-Nr.']} onChange={e => setEditEntryData(d => ({ ...d, 'Ihre Rechnungs-Nr.': e.target.value }))} required />
                  {editEntryFieldErrorsCurrent['Ihre Rechnungs-Nr.'] && <span style={{ color: '#b91c1c', fontSize: '0.97em' }}>{editEntryFieldErrorsCurrent['Ihre Rechnungs-Nr.']}</span>}
                </label>
                <label>
                  Betrag*<br />
                  <input
                    type="text"
                    value={editEntryData.Betrag}
                    onChange={e => setEditEntryData(d => ({ ...d, Betrag: e.target.value }))}
                    required
                  />
                  {editEntryFieldErrorsCurrent.Betrag && <span style={{ color: '#b91c1c', fontSize: '0.97em' }}>{editEntryFieldErrorsCurrent.Betrag}</span>}
                </label>
                <label>
                  Billing Date*<br />
                  <input
                    type="text"
                    value={editEntryData['Billing Date']}
                    onChange={e => {
                      // Only allow numbers and .
                      let val = e.target.value.replace(/[^\d\.]/g, '');
                      if (val.length > 10) val = val.slice(0, 10);
                      setEditEntryData(d => ({ ...d, 'Billing Date': val }));
                    }}
                    maxLength={10}
                    placeholder="DD.MM.YYYY"
                    required
                  />
                  {editEntryFieldErrorsCurrent['Billing Date'] && <span style={{ color: '#b91c1c', fontSize: '0.97em' }}>{editEntryFieldErrorsCurrent['Billing Date']}</span>}
                </label>
                {editEntryError && <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', fontWeight: 500 }}>{editEntryError}</div>}
              </div>
              <div style={{ marginTop: 18, textAlign: 'right' }}>
                <button type="button" onClick={() => setEditEntryOpen(false)} style={{ marginRight: 8 }}>Cancel</button>
                <button type="submit" disabled={!isEditEntryValid} style={{ background: isEditEntryValid ? '#2563eb' : '#ccc', color: 'white', fontWeight: 600 }}>
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
