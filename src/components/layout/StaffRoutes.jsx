/**
 * StaffRoutes — the staff app's route map, extracted from App.jsx (Debt 11).
 *
 * Pure presentation: every view gets exactly the props it got when the
 * `<Routes>` block lived inline in App.jsx. The only structural change is
 * that the two profile routes (`/humans/:id`, `/dogs/:id`) share one props
 * object with their directory route instead of repeating 25 identical props.
 *
 * Props:
 *   data  — the return value of `useStaffAppData` (resolved online/offline
 *           data + actions, plus the raw per-hook APIs).
 *   nav   — `useWeekNav` result with `handleDatePick` already wrapped to
 *           close the date picker.
 *   ui    — auth identity, connectivity, the modal openers and the
 *           cross-view "open X" callbacks owned by App.jsx.
 */
import { lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// Dev-only preview catalogue for the right-rail tones. Tree-shaken
// out of production bundles by Vite (the route below is gated on
// `import.meta.env.DEV`, which folds to `false` in prod).
const RightRailPreview = import.meta.env.DEV
  ? lazy(() =>
      import("../dev/RightRailPreview.jsx").then((module) => ({
        default: module.RightRailPreview,
      })),
    )
  : () => null;
// Dev-only harness for the inbox compose bar. Same tree-shaking guarantee.
const ComposePreview = import.meta.env.DEV
  ? lazy(() =>
      import("../dev/ComposePreview.jsx").then((module) => ({
        default: module.ComposePreview,
      })),
    )
  : () => null;
// Dev-only harness for the New client wizard. Same tree-shaking guarantee.
const NewClientPreview = import.meta.env.DEV
  ? lazy(() =>
      import("../dev/NewClientPreview.jsx").then((module) => ({
        default: module.NewClientPreview,
      })),
    )
  : () => null;
// Dev-only harness for the booking wizard shell. Same tree-shaking guarantee.
const BookingWizardShellPreview = import.meta.env.DEV
  ? lazy(() =>
      import("../dev/BookingWizardShellPreview.jsx").then((module) => ({
        default: module.BookingWizardShellPreview,
      })),
    )
  : () => null;
// Dev-only harness for the customer dashboard cards. Same tree-shaking guarantee.
const CustomerDashboardCardsPreview = import.meta.env.DEV
  ? lazy(() =>
      import("../dev/CustomerDashboardCardsPreview.jsx").then((module) => ({
        default: module.CustomerDashboardCardsPreview,
      })),
    )
  : () => null;

// Route views. The import specifiers below resolve to the SAME modules as
// App.jsx's ROUTE_CHUNK_IMPORTS (which pre-warms the current route's chunk
// during the auth gate), so Vite emits one chunk per view.
const SettingsView = lazy(() =>
  import("../views/SettingsView.jsx").then((module) => ({
    default: module.SettingsView,
  })),
);
const HumansView = lazy(() =>
  import("../views/HumansView.jsx").then((module) => ({
    default: module.HumansView,
  })),
);
const DogsView = lazy(() =>
  import("../views/DogsView.jsx").then((module) => ({
    default: module.DogsView,
  })),
);
const TodayView = lazy(() =>
  import("../views/TodayView.jsx").then((module) => ({
    default: module.TodayView,
  })),
);
const NeedsAttentionView = lazy(() =>
  import("../views/NeedsAttentionView.jsx").then((module) => ({
    default: module.NeedsAttentionView,
  })),
);
const WeekCalendarView = lazy(() =>
  import("./WeekCalendarView.jsx").then((module) => ({
    default: module.WeekCalendarView,
  })),
);
const ReportsLayout = lazy(() =>
  import("../views/reports/ReportsLayout.jsx").then((module) => ({
    default: module.ReportsLayout,
  })),
);
const CashUpView = lazy(() =>
  import("../views/reports/CashUpView.jsx").then((module) => ({
    default: module.CashUpView,
  })),
);
const ReportsInsightsView = lazy(() =>
  import("../views/reports/ReportsInsightsView.jsx").then((module) => ({
    default: module.ReportsInsightsView,
  })),
);
const InboxView = lazy(() =>
  import("../views/inbox/InboxView.jsx").then((module) => ({
    default: module.InboxView,
  })),
);
const BookingWorkspaceView = lazy(() =>
  import("../views/booking-workspace/BookingWorkspaceView.jsx").then((module) => ({
    default: module.BookingWorkspaceView,
  })),
);

export function StaffRoutes({ data, nav, ui }) {
  const {
    humansApi,
    dogsApi,
    bookingsApi,
    configApi,
    dogs,
    humans,
    bookingsByDate,
    salonConfig,
    daySettings,
    handleUpdate,
    toggleDayOpen,
    handleOverride,
    toggleImmediateSlot,
    handleAddSlot,
    handleRemoveSlot,
    updateConfig,
    isLoading,
    bookingsLoading,
    loadErrors,
    currentSettings,
    dayOpenState,
  } = data;
  const {
    selectedDay,
    setSelectedDay,
    dates,
    currentDateObj,
    currentDateStr,
    handleDatePick,
  } = nav;
  const {
    user,
    staffProfile,
    isOwner,
    isOnline,
    canAccessBookingWorkspace,
    showDatePicker,
    setShowDatePicker,
    showNewBooking,
    draftTarget,
    requestNewBooking,
    openNewClient,
    onOpenDog,
    onOpenHuman,
    onOpenBooking,
    onOpenClosureVisit,
    onSendCollection,
  } = ui;

  // /humans and /humans/:id render the same directory; the profile route
  // just has the modal opened for it by App's URL → modal-state effect.
  const humansViewProps = {
    onNewClient: openNewClient,
    onApproveSignup: humansApi.approveSignup,
    fetchArchivedHumans: humansApi.fetchArchivedHumans,
    hasMore: humansApi.hasMore,
    totalCount: humansApi.totalCount,
    loadMore: humansApi.loadMore,
    onSearch: humansApi.searchHumans,
    searchQuery: humansApi.searchQuery,
    isSearching: humansApi.isSearching,
    directoryHumans: isOnline ? humansApi.directoryHumans : null,
    availableLetters: humansApi.availableLetters,
    sortMode: humansApi.dirSort,
    onSortModeChange: humansApi.setDirSort,
    filters: humansApi.dirFilters,
    onToggleFilter: humansApi.toggleDirFilter,
    activeLetter: humansApi.dirLetter,
    onLetterChange: humansApi.setDirLetter,
    isInitialLoading: isLoading,
    loadError: loadErrors.humans,
  };

  // Same for /dogs and /dogs/:id. Note the directory edits a dog through the
  // raw Supabase updater (dogsApi.updateDog), not the online/offline-resolved
  // one — unchanged from the pre-extraction wiring.
  const dogsViewProps = {
    hasMore: dogsApi.hasMore,
    totalCount: dogsApi.totalCount,
    loadMore: dogsApi.loadMore,
    onSearch: dogsApi.searchDogs,
    searchQuery: dogsApi.searchQuery,
    isSearching: dogsApi.isSearching,
    directoryDogs: isOnline ? dogsApi.directoryDogs : null,
    availableLetters: dogsApi.dogAvailableLetters,
    sortMode: dogsApi.dirSort,
    onSortModeChange: dogsApi.setDirSort,
    filters: dogsApi.dirFilters,
    onToggleFilter: dogsApi.toggleDirFilter,
    activeLetter: dogsApi.dirLetter,
    onLetterChange: dogsApi.setDirLetter,
    fetchArchivedDogs: dogsApi.fetchArchivedDogs,
    onUpdateDog: dogsApi.updateDog,
    isInitialLoading: isLoading,
    loadError: loadErrors.dogs,
  };

  return (
    <Routes>
      <Route path="/settings" element={
        <SettingsView
          config={salonConfig}
          onUpdateConfig={updateConfig}
          bookingRules={configApi.bookingRules}
          bookingPolicyRuntime={configApi.bookingPolicyRuntime}
          bookingRulesLoading={configApi.bookingRulesLoading}
          bookingRulesConfirmed={configApi.bookingRulesConfirmed}
          bookingRulesError={configApi.bookingRulesError}
          onUpdateBookingRules={configApi.updateBookingRules}
          isOwner={isOwner}
          canEdit={isOwner || !isOnline}
          user={user}
          staffProfile={staffProfile}
        />
      } />
      <Route path="/humans" element={<HumansView {...humansViewProps} />} />
      {/* Profile route: shows the same HumansView underneath with the
          profile modal opened by the URL → state effect. */}
      <Route path="/humans/:id" element={<HumansView {...humansViewProps} />} />
      <Route path="/dogs" element={<DogsView {...dogsViewProps} />} />
      <Route path="/dogs/:id" element={<DogsView {...dogsViewProps} />} />
      <Route path="/reports" element={<ReportsLayout />}>
        <Route index element={<Navigate to="cash-up" replace />} />
        <Route path="cash-up" element={<CashUpView />} />
        <Route
          path="insights"
          element={
            <ReportsInsightsView
              loadError={loadErrors.bookings || loadErrors.dogs || loadErrors.humans}
            />
          }
        />
      </Route>
      <Route path="/inbox" element={
        <InboxView
          onOpenHuman={onOpenHuman}
          onOpenDog={onOpenDog}
        />
      } />
      <Route path="/booking-workspace" element={
        canAccessBookingWorkspace ? (
          <BookingWorkspaceView
            isOnline={isOnline}
            dates={dates}
            currentDateStr={currentDateStr}
            onPickDate={handleDatePick}
            dailyDogCap={salonConfig?.dailyDogCap}
          />
        ) : (
          <Navigate to="/today" replace />
        )
      } />
      <Route path="/whatsapp" element={<Navigate to="/inbox" replace />} />
      {/* Read-only backlog of unfinished work from previous days.
          Clicking an item opens the shared BookingDetailModal via
          onOpenBooking — the view itself mutates nothing. */}
      <Route path="/needs-attention" element={
        <NeedsAttentionView
          dogs={dogs}
          humans={humans}
          onOpenBooking={onOpenBooking}
        />
      } />
      <Route path="/today" element={
        <TodayView
          selectedDateObj={currentDateObj}
          selectedDateStr={currentDateStr}
          onOpenDatePicker={() => setShowDatePicker(true)}
          onOpenDog={onOpenDog}
          onOpenHuman={onOpenHuman}
          bookingsByDate={bookingsByDate}
          bookingsLoading={bookingsLoading}
          bookingsError={loadErrors.bookings}
          dogs={dogs}
          humans={humans}
          daySettings={daySettings}
          dayOpenState={dayOpenState}
          isOnline={isOnline}
          onUpdateBooking={handleUpdate}
          onOpenBooking={onOpenBooking}
          onNewBooking={requestNewBooking}
          onSendCollection={onSendCollection}
          toggleImmediateSlot={toggleImmediateSlot}
          onRefresh={bookingsApi.refetch}
          configPricing={salonConfig?.pricing}
        />
      } />
      <Route path="/" element={
        <WeekCalendarView
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          dates={dates}
          currentSettings={currentSettings}
          handleOverride={handleOverride}
          toggleImmediateSlot={toggleImmediateSlot}
          handleAddSlot={handleAddSlot}
          handleRemoveSlot={handleRemoveSlot}
          toggleDayOpen={toggleDayOpen}
          showDatePicker={showDatePicker}
          setShowDatePicker={setShowDatePicker}
          handleDatePick={handleDatePick}
          setShowNewBooking={requestNewBooking}
          draftPick={showNewBooking ? draftTarget : null}
          onOpenClosureVisit={onOpenClosureVisit}
          onRefresh={bookingsApi.refetch}
        />
      } />
      {import.meta.env.DEV && (
        <Route
          path="/dev/right-rail-preview"
          element={<RightRailPreview />}
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/dev/compose-preview"
          element={<ComposePreview />}
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/dev/new-client"
          element={<NewClientPreview />}
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/dev/booking-wizard-shell-preview"
          element={<BookingWizardShellPreview />}
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/dev/customer-dashboard-cards-preview"
          element={<CustomerDashboardCardsPreview />}
        />
      )}
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
}
