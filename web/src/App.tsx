import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthGate } from './components/AuthGate';
import { Layout } from './components/Layout';
import { Dashboard } from './routes/Dashboard';
import { SearchPage } from './routes/SearchPage';
import { LibraryPage } from './routes/LibraryPage';
import { PaperDetail } from './routes/PaperDetail';
import { ThesisPage } from './routes/ThesisPage';
import { ReportsPage } from './routes/ReportsPage';
import { ImportPage } from './routes/ImportPage';
import { AskPage } from './routes/AskPage';
import { ResultPage } from './routes/ResultPage';

export default function App() {
  return (
    <AuthGate>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/search" element={<SearchPage />} />
        <Route path="/import" element={<ImportPage />} />
          <Route path="/ask" element={<AskPage />} />
          <Route path="/result" element={<ResultPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/paper/:id" element={<PaperDetail />} />
          <Route path="/thesis" element={<ThesisPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthGate>
  );
}
