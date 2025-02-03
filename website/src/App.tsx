import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import PageNotFound from './pages/PageNotFound.tsx';

function App() {
  return (
    <Router>
        <Routes>
            <Route path="*" element={<PageNotFound />} />
        </Routes>
    </Router>
  )
}

export default App
