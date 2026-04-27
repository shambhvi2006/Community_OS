import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import NeedsMapPage from "./pages/NeedsMapPage";
import ImpactPage from "./pages/ImpactPage";
import InventoryPage from "./pages/InventoryPage";
import ForecastsPage from "./pages/ForecastsPage";
import AdminPage from "./pages/AdminPage";
import OverflowPage from "./pages/OverflowPage";
import BlogPage from "./pages/BlogPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ImpactPage />} />
            <Route path="map" element={<NeedsMapPage />} />
            <Route path="impact" element={<ImpactPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="forecasts" element={<ForecastsPage />} />
            <Route
              path="overflow"
              element={<OverflowPage />}
            />
            <Route path="blog" element={<BlogPage />} />
            <Route
              path="admin"
              element={
                <ProtectedRoute allowedRoles={["ngo_admin", "super_admin"]}>
                  <AdminPage />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
