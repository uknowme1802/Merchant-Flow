import React  from 'react'
import ReactDOM from 'react-dom/client'
import './index.css';
import App from './App.jsx'
import { AuthProvider } from './context/AuthProvider.jsx';
import {Toaster} from "react-hot-toast"

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <App />
    <Toaster position="top-right" />
  </AuthProvider>
)
