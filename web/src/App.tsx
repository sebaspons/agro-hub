import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Spinner } from "./components/ui";
import Layout from "./components/layout/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import MoneyLeak from "./pages/MoneyLeak";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Quotes from "./pages/Quotes";
import Visits from "./pages/Visits";
import Sales from "./pages/Sales";
import Products from "./pages/Products";
import Recommendations from "./pages/Recommendations";
import Inventory from "./pages/Inventory";
import Finance from "./pages/Finance";
import Purchases from "./pages/Purchases";
import Logistics from "./pages/Logistics";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Cargando…" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/money-leak" element={<MoneyLeak />} />
        <Route path="/clientes" element={<Customers />} />
        <Route path="/clientes/:id" element={<CustomerDetail />} />
        <Route path="/cotizaciones" element={<Quotes />} />
        <Route path="/visitas" element={<Visits />} />
        <Route path="/ventas" element={<Sales />} />
        <Route path="/productos" element={<Products />} />
        <Route path="/recomendaciones" element={<Recommendations />} />
        <Route path="/inventario" element={<Inventory />} />
        <Route path="/finanzas" element={<Finance />} />
        <Route path="/compras" element={<Purchases />} />
        <Route path="/logistica" element={<Logistics />} />
        <Route path="/reportes" element={<Reports />} />
        <Route path="/configuracion" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
