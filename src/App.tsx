import React, {useEffect, useState} from 'react';
import './App.scss';
import KanbanBoard from './components/KanbanBoard/KanbanBoard';
import LoginForm from './components/LoginForm/LoginForm';

type Config = {
  apiKey: string;
  spreadsheetId: string;
  range: string;
};

const App: React.FC = () => {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('GOOGLE_CONFIG');
    if (stored) {
      setConfig(JSON.parse(stored));
    }
  }, []);

  return (
    <>
      {!config && <LoginForm onLogin={setConfig} />}
      {config && (
        <KanbanBoard
          apiKey={config.apiKey}
          spreadsheetId={config.spreadsheetId}
          range={config.range}
        />
      )}
    </>
  );
};
export default App;
