import React, { useState } from 'react';
import './LoginForm.scss';

type LoginFormProps = {
  onLogin: (config: { apiKey: string; spreadsheetId: string; range: string }) => void;
};

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [apiKey, setApiKey] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [range, setRange] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || !spreadsheetId.trim() || !range.trim()) return;

    const config = { apiKey, spreadsheetId, range };
    localStorage.setItem('GOOGLE_CONFIG', JSON.stringify(config));
    onLogin(config);
  };

  return (
    <div className="login">
      <form className="login__form" onSubmit={handleSubmit}>
        <h2 className="login__title">Google Sheets Config</h2>

        <input
          type="password"
          className="login__input"
          value={apiKey}
          placeholder="Enter API Key"
          onChange={(e) => setApiKey(e.target.value)}
        />

        <input
          type="text"
          className="login__input"
          value={spreadsheetId}
          placeholder="Enter Spreadsheet ID"
          onChange={(e) => setSpreadsheetId(e.target.value)}
        />

        <input
          type="text"
          className="login__input"
          value={range}
          placeholder="Enter Range (e.g. Аркуш1!A2:M)"
          onChange={(e) => setRange(e.target.value)}
        />

        <button className="login__button" type="submit">Save & Continue</button>
      </form>
    </div>
  );
}
