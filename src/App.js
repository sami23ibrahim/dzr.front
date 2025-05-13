import React, { useState } from "react";
import axios from "axios";
import './App.css';

function App() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    setSelectedFiles(e.target.files);
  };

  const handleUpload = async () => {
    if (!selectedFiles.length) return;
    setLoading(true);
    const formData = new FormData();
    for (let file of selectedFiles) {
      formData.append("files", file);
    }
    try {
      const res = await axios.post("http://127.0.0.1:5000/api/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setTableData(res.data.data);
    } catch (err) {
      alert("Upload failed. See console for details.");
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 20 }}>
      <h2>Invoice PDF Extractor</h2>
      <input type="file" multiple accept="application/pdf" onChange={handleFileChange} />
      <button onClick={handleUpload} disabled={loading || !selectedFiles.length} style={{ marginLeft: 10 }}>
        {loading ? "Processing..." : "Upload & Extract"}
      </button>
      {tableData.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <h3>Extracted Data</h3>
          <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Rechnungsempfängers</th>
                <th>Rechnungs-Nr. DZR</th>
                <th>Ihre Rechnungs-Nr.</th>
                <th>Betrag</th>
                <th>Billing Date</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, idx) => (
                <tr key={idx}>
                  <td>{row["Name"]}</td>
                  <td>{row["Rechnungsempfängers"]}</td>
                  <td>{row["Rechnungs-Nr. DZR"]}</td>
                  <td>{row["Ihre Rechnungs-Nr."]}</td>
                  <td>{row["Betrag"]}</td>
                  <td>{row["Billing Date"]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
