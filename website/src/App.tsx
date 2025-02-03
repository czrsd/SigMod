import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import PageNotFound from './pages/PageNotFound.tsx';
import HomePage from './pages/HomePage.tsx';

function App() {
  return (
    <Router>
        <Routes>
            <Route path='/' element={<HomePage />} />
            <Route path="*" element={<PageNotFound />} />
        </Routes>
    </Router>
  )
}

export default App
