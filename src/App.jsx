import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ModalProvider } from './context/ModalContext.jsx';
import { RequireRole, RequirePerm, NotFound } from './components/Guards.jsx';
import AppShell from './layouts/AppShell.jsx';
import { TENANT_NAV, ADMIN_NAV } from './nav.js';
import { HomeScreen, LoginScreen, RegisterScreen, ForgotPasswordScreen } from './components/Auth.jsx';
import { RoomDesigner } from './components/RoomDesigner.jsx';
import { AdminRoomLayouts } from './components/AdminRoomLayouts.jsx';
import AdminMap from './components/canvas.jsx';
import { TenantSupport, StaffSupport } from './components/SupportChat.jsx';
import {
  TenantDashboard, RoomPicker, RoomDetail, Booking, MoveIn,
  MoveOut, TenantBilling, TenantMaintenance, Profile,
} from './pages/TenantPages.jsx';
import {
  AdminDashboard, Tenants, TenantDetail, Rooms, AdminBilling, AdminMaintenance,
  Reservations, MoveInReviews, Reports, Staff, Settings,
} from './pages/AdminPages.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ModalProvider>
            <ScrollToTop />
            <Routes>
              {/* public */}
              <Route path="/" element={<HomeScreen />} />
              <Route path="/login" element={<LoginScreen />} />
              <Route path="/register" element={<RegisterScreen />} />
              <Route path="/forgot-password" element={<ForgotPasswordScreen />} />

              {/* tenant portal */}
              <Route path="/tenant" element={<RequireRole role="tenant"><AppShell portal="tenant" nav={TENANT_NAV} /></RequireRole>}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<TenantDashboard />} />
                <Route path="rooms" element={<RoomPicker />} />
                <Route path="rooms/:roomId" element={<RoomDetail />} />
                <Route path="rooms/:roomId/book" element={<Booking />} />
                <Route path="move-in" element={<MoveIn />} />
                <Route path="move-out" element={<MoveOut />} />
                <Route path="room-designer" element={<RoomDesigner />} />
                <Route path="billing" element={<TenantBilling />} />
                <Route path="maintenance" element={<TenantMaintenance />} />
                <Route path="profile" element={<Profile />} />
                <Route path="support" element={<TenantSupport />} />
                <Route path="*" element={<NotFound />} />
              </Route>

              {/* staff portal */}
              <Route path="/admin" element={<RequireRole role="staff"><AppShell portal="admin" nav={ADMIN_NAV} /></RequireRole>}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="tenants" element={<RequirePerm perm="tenants"><Tenants /></RequirePerm>} />
                <Route path="tenants/:id" element={<RequirePerm perm="tenants"><TenantDetail /></RequirePerm>} />
                <Route path="reservations" element={<RequirePerm perm="tenants"><Reservations /></RequirePerm>} />
                <Route path="move-ins" element={<RequirePerm perm="tenants"><MoveInReviews /></RequirePerm>} />
                <Route path="rooms" element={<RequirePerm perm="rooms"><Rooms /></RequirePerm>} />
                <Route path="room-layouts" element={<RequirePerm perm="rooms"><AdminRoomLayouts /></RequirePerm>} />
                <Route path="billing" element={<RequirePerm perm="billing"><AdminBilling /></RequirePerm>} />
                <Route path="maintenance" element={<RequirePerm perm="maintenance"><AdminMaintenance /></RequirePerm>} />
                <Route path="reports" element={<RequirePerm perm="billing"><Reports /></RequirePerm>} />
                <Route path="staff" element={<RequirePerm perm="staff"><Staff /></RequirePerm>} />
                <Route path="settings" element={<RequirePerm perm="settings"><Settings /></RequirePerm>} />
                <Route path="map" element={<AdminMap />} />
                <Route path="support" element={<StaffSupport />} />
                <Route path="*" element={<NotFound />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </ModalProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}