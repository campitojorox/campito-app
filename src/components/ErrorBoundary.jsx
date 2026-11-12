// src/components/ErrorBoundary.jsx
// Capturador resiliente de errores para evitar pantallas en negro en la aplicación.

import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Error capturado en la vista:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          reset: this.handleReset,
        });
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: '24px',
            backgroundColor: '#1a1a1a',
            color: '#ffffff',
            textAlign: 'center',
            fontFamily: 'inherit',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <AlertTriangle size={32} color="#ef4444" />
          </div>

          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px 0', color: '#f87171' }}>
            Se ha producido un error inesperado
          </h2>

          <p style={{ fontSize: '0.88rem', color: '#94a3b8', maxWidth: 480, margin: '0 0 20px 0' }}>
            {this.props.sectionName
              ? `Ocurrió un problema en la sección de ${this.props.sectionName}. Puedes recargar para continuar.`
              : 'Ocurrió un problema visual. Pulsa recargar para restablecer la vista sin perder tus datos.'}
          </p>

          {this.state.error && (
            <details
              style={{
                width: '100%',
                maxWidth: 520,
                marginBottom: 24,
                padding: '10px 14px',
                borderRadius: 8,
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                textAlign: 'left',
              }}
            >
              <summary
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                Detalles técnicos del error
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  fontSize: '0.72rem',
                  color: '#fca5a5',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {this.state.error.toString()}
              </pre>
            </details>
          )}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                borderRadius: 8,
                backgroundColor: '#00979d',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.85rem',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={16} />
              <span>Reintentar</span>
            </button>

            <a
              href="/"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                borderRadius: 8,
                backgroundColor: '#262626',
                color: '#cbd5e1',
                fontWeight: 600,
                fontSize: '0.85rem',
                border: '1px solid #404040',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              <Home size={16} />
              <span>Volver a la App</span>
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

