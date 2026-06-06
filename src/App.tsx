/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import MessageView from './pages/MessageView';
import ChatView from './pages/ChatView';
import VaultView from './pages/VaultView';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import PanicMode from './components/PanicMode';

export default function App() {
  return (
    <PanicMode>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/m/:id" element={<MessageView />} />
          <Route path="/c/:code" element={<ChatView />} />
          <Route path="/v/:id" element={<VaultView />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
        </Routes>
      </BrowserRouter>
    </PanicMode>
  );
}
