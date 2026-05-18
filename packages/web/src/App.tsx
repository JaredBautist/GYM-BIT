import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

// Screens will be added in subsequent tasks
const Home: React.FC = () => <div>GymBit Web — Coming soon</div>;

const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  </BrowserRouter>
);

export default App;
