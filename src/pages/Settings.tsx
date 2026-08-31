import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Lock, Save, DollarSign, Mail, Palette, RefreshCw, Bus, Wifi, Award, Languages, Shield, Eye, EyeOff, BarChart3 } from "lucide-react";
import { useTheme } from "next-themes";
import { getUserSettings, updateUserSettings } from "@/lib/store";

const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be under 20 characters");

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Requires at least one uppercase letter")
  .regex(/[a-z]/, "Requires at least one lowercase letter")
  .regex(/[0-9]/, "Requires at least one digit");

export default function Settings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [autosaveMode, setAutosaveMode] = useState<"manual" | "immediate" | "hourly">("manual");
  const [appTheme, setAppTheme] = useState<string>("dark");

  const [baseSalary, setBaseSalary] = useState<string>("");
  const [taxRate, setTaxRate] = useState<string>("");
  const [kpiPercentage, setKpiPercentage] = useState<string>("70");
  const [transportAllowance, setTransportAllowance] = useState<string>("0");
  const [transportApplied, setTransportApplied] = useState<boolean>(true);
  const [internetAllowance, setInternetAllowance] = useState<string>("0");
  const [seniorBonus, setSeniorBonus] = useState<string>("0");
  const [languageAllowance, setLanguageAllowance] = useState<string>("0");
  const [salaryPaymentDay, setSalaryPaymentDay] = useState<string>("27");
  const [salaryDelayMonths, setSalaryDelayMonths] = useState<string>("1");
  const [kpiDelayMonths, setKpiDelayMonths] = useState<string>("2");
  const [employeeType, setEmployeeType] = useState<string>("new");
  const [startMonth, setStartMonth] = useState<string>("");
  const [knownBonusMonth, setKnownBonusMonth] = useState<string>("");
  const [isSalarySaving, setIsSalarySaving] = useState(false);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isFloorSaving, setIsFloorSaving] = useState(false);

  // Floor average manual overrides
  const [faProductivity, setFaProductivity] = useState<string>("");
  const [faCsat, setFaCsat] = useState<string>("");
  const [faAht, setFaAht] = useState<string>("");
  const [faCloseRate, setFaCloseRate] = useState<string>("");
  const [faFcr, setFaFcr] = useState<string>("");
  const [faEscalationRate, setFaEscalationRate] = useState<string>("");
  const [faAdherence, setFaAdherence] = useState<string>("");
  const [faIrtReplier, setFaIrtReplier] = useState<string>("");
  const [faClosedAfterResolution, setFaClosedAfterResolution] = useState<string>("");
  const [faDeescalationRate, setFaDeescalationRate] = useState<string>("");
  const [faOccupancy, setFaOccupancy] = useState<string>("");
  const [faAvgGroupBasketTime, setFaAvgGroupBasketTime] = useState<string>("");
  const [faBreakExceed, setFaBreakExceed] = useState<string>("");
  const [faIdleTime, setFaIdleTime] = useState<string>("");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const userId = user?.id || "local";

  useEffect(() => {
    const stored = localStorage.getItem("gt_profile_" + userId);
    if (stored) {
      try {
        const profile = JSON.parse(stored);
        if (profile.username) setUsername(profile.username);
        if (profile.displayName) setDisplayName(profile.displayName);
        if (profile.autosaveMode) setAutosaveMode(profile.autosaveMode);
      } catch {}
    } else if (user?.email) {
      setUsername(user.email.split("@")[0]);
      setDisplayName(user.email.split("@")[0]);
    }
    if (theme) setAppTheme(theme);
  }, [user, userId, theme]);

  useEffect(() => {
    if (!userId) return;
    try {
      const settings = getUserSettings(userId) as any;
      if (settings) {
        if (settings.baseSalary != null) setBaseSalary(String(settings.baseSalary));
        if (settings.taxRate != null) setTaxRate(String(settings.taxRate));
        if (settings.kpiPercentage != null) setKpiPercentage(String(settings.kpiPercentage));
        else if (settings.kpi_percentage != null) setKpiPercentage(String(settings.kpi_percentage));
        if (settings.transportAllowance != null) setTransportAllowance(String(settings.transportAllowance));
        else if (settings.transportation_allowance != null) setTransportAllowance(String(settings.transportation_allowance));
        if (settings.transportApplied != null) setTransportApplied(!!settings.transportApplied);
        else if (settings.transport_applied != null) setTransportApplied(!!settings.transport_applied);
        if (settings.internetAllowance != null) setInternetAllowance(String(settings.internetAllowance));
        else if (settings.internet_allowance != null) setInternetAllowance(String(settings.internet_allowance));
        if (settings.seniorBonus != null) setSeniorBonus(String(settings.seniorBonus));
        else if (settings.senior_bonus != null) setSeniorBonus(String(settings.senior_bonus));
        if (settings.languageAllowance != null) setLanguageAllowance(String(settings.languageAllowance));
        else if (settings.language_allowance != null) setLanguageAllowance(String(settings.language_allowance));
        if (settings.salaryPaymentDay != null) setSalaryPaymentDay(String(settings.salaryPaymentDay));
        else if (settings.salary_payment_day != null) setSalaryPaymentDay(String(settings.salary_payment_day));
        if (settings.salaryDelayMonths != null) setSalaryDelayMonths(String(settings.salaryDelayMonths));
        else if (settings.salary_delay_months != null) setSalaryDelayMonths(String(settings.salary_delay_months));
        if (settings.kpiDelayMonths != null) setKpiDelayMonths(String(settings.kpiDelayMonths));
        else if (settings.kpi_delay_months != null) setKpiDelayMonths(String(settings.kpi_delay_months));
        if (settings.employeeType != null) setEmployeeType(settings.employeeType);
        else if (settings.employee_type != null) setEmployeeType(settings.employee_type);
        if (settings.startMonth != null) setStartMonth(settings.startMonth);
        else if (settings.start_month != null) {
          setStartMonth(settings.start_month);
          const [yearStr, monthStr] = settings.start_month.split('-');
          if (yearStr && monthStr) {
            const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
            date.setMonth(date.getMonth() + 5);
            setKnownBonusMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
          }
        }
        if (settings.shiftStartTime != null) {} // handled elsewhere
        // Floor average overrides
        if (settings.floorAvgProductivity != null) setFaProductivity(String(settings.floorAvgProductivity));
        if (settings.floorAvgCsat != null) setFaCsat(String(settings.floorAvgCsat));
        if (settings.floorAvgAht != null) setFaAht(String(settings.floorAvgAht));
        if (settings.floorAvgCloseRate != null) setFaCloseRate(String(settings.floorAvgCloseRate));
        if (settings.floorAvgFcr != null) setFaFcr(String(settings.floorAvgFcr));
        if (settings.floorAvgEscalationRate != null) setFaEscalationRate(String(settings.floorAvgEscalationRate));
        if (settings.floorAvgAdherence != null) setFaAdherence(String(settings.floorAvgAdherence));
        if (settings.floorAvgIrtReplier != null) setFaIrtReplier(String(settings.floorAvgIrtReplier));
        if (settings.floorAvgClosedAfterResolution != null) setFaClosedAfterResolution(String(settings.floorAvgClosedAfterResolution));
        if (settings.floorAvgDeescalationRate != null) setFaDeescalationRate(String(settings.floorAvgDeescalationRate));
        if (settings.floorAvgOccupancy != null) setFaOccupancy(String(settings.floorAvgOccupancy));
        if (settings.floorAvgAvgGroupBasketTime != null) setFaAvgGroupBasketTime(String(settings.floorAvgAvgGroupBasketTime));
        if (settings.floorAvgBreakExceed != null) setFaBreakExceed(String(settings.floorAvgBreakExceed));
        if (settings.floorAvgIdleTime != null) setFaIdleTime(String(settings.floorAvgIdleTime));
      }
    } catch (e) {
      console.error('Error loading settings:', e);
    }
  }, [userId]);

  const handleKnownBonusMonthChange = (val: string) => {
    setKnownBonusMonth(val);
    if (!val) return;
    const [yearStr, monthStr] = val.split('-');
    if (yearStr && monthStr) {
      const d = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
      d.setMonth(d.getMonth() - 5);
      setStartMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  };

  const onSalarySave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setIsSalarySaving(true);
    try {
      updateUserSettings(userId, {
        baseSalary: baseSalary ? parseFloat(baseSalary) : null,
        taxRate: taxRate ? parseFloat(taxRate) : null,
        kpiPercentage: kpiPercentage ? parseFloat(kpiPercentage) : 70,
        transportAllowance: transportAllowance ? parseFloat(transportAllowance) : 0,
        transportApplied,
        internetAllowance: internetAllowance ? parseFloat(internetAllowance) : 0,
        seniorBonus: seniorBonus ? parseFloat(seniorBonus) : 0,
        languageAllowance: languageAllowance ? parseFloat(languageAllowance) : 0,
        salaryPaymentDay: salaryPaymentDay ? parseInt(salaryPaymentDay) : 27,
        salaryDelayMonths: salaryDelayMonths ? parseInt(salaryDelayMonths) : 1,
        kpiDelayMonths: kpiDelayMonths ? parseInt(kpiDelayMonths) : 2,
        employeeType,
        startMonth: startMonth || null,
      } as any);
      toast.success("Salary settings saved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save");
    } finally {
      setIsSalarySaving(false);
    }
  };

  const onProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try { usernameSchema.parse(username); } catch (err) {
      if (err instanceof z.ZodError) { toast.error(err.errors[0].message); return; }
    }
    setIsProfileSaving(true);
    try {
      localStorage.setItem("gt_profile_" + userId, JSON.stringify({
        username,
        displayName,
        autosaveMode,
      }));
      toast.success("Profile updated successfully");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save profile");
    } finally {
      setIsProfileSaving(false);
    }
  };

  const onFloorSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setIsFloorSaving(true);
    try {
      updateUserSettings(userId, {
        floorAvgProductivity: faProductivity ? parseFloat(faProductivity) : null,
        floorAvgCsat: faCsat ? parseFloat(faCsat) : null,
        floorAvgAht: faAht ? parseFloat(faAht) : null,
        floorAvgCloseRate: faCloseRate ? parseFloat(faCloseRate) : null,
        floorAvgFcr: faFcr ? parseFloat(faFcr) : null,
        floorAvgEscalationRate: faEscalationRate ? parseFloat(faEscalationRate) : null,
        floorAvgAdherence: faAdherence ? parseFloat(faAdherence) : null,
        floorAvgIrtReplier: faIrtReplier ? parseFloat(faIrtReplier) : null,
        floorAvgClosedAfterResolution: faClosedAfterResolution ? parseFloat(faClosedAfterResolution) : null,
        floorAvgDeescalationRate: faDeescalationRate ? parseFloat(faDeescalationRate) : null,
        floorAvgOccupancy: faOccupancy ? parseFloat(faOccupancy) : null,
        floorAvgAvgGroupBasketTime: faAvgGroupBasketTime ? parseFloat(faAvgGroupBasketTime) : null,
        floorAvgBreakExceed: faBreakExceed ? parseFloat(faBreakExceed) : null,
        floorAvgIdleTime: faIdleTime ? parseFloat(faIdleTime) : null,
      } as any);
      toast.success("Floor averages saved — will be used on next dashboard load");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsFloorSaving(false);
    }
  };

  const onPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    if (oldPassword === newPassword) { toast.error("New password must be different"); return; }
    try { passwordSchema.parse(newPassword); } catch (err) {
      if (err instanceof z.ZodError) { toast.error(err.errors[0].message); return; }
    }
    setIsPasswordLoading(true);
    // Local auth: store password hash in localStorage
    // This is NOT secure - it's for local mode only
    try {
      const stored = localStorage.getItem("gt_password_" + userId);
      if (stored && stored !== oldPassword) {
        toast.error("Incorrect current password");
        setIsPasswordLoading(false);
        return;
      }
      localStorage.setItem("gt_password_" + userId, newPassword);
      toast.success("Password changed successfully");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Failed to change password");
    } finally {
      setIsPasswordLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account, salary, and security preferences.</p>
      </div>

      <Tabs defaultValue="account" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="account" className="gap-2"><User className="h-4 w-4" /> Account</TabsTrigger>
          <TabsTrigger value="salary" className="gap-2"><DollarSign className="h-4 w-4" /> Salary</TabsTrigger>
          <TabsTrigger value="floor" className="gap-2"><BarChart3 className="h-4 w-4" /> Floor Avg</TabsTrigger>
          <TabsTrigger value="security" className="gap-2"><Lock className="h-4 w-4" /> Security</TabsTrigger>
        </TabsList>

        {/* Account Tab */}
        <TabsContent value="account">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Profile & Preferences</CardTitle>
              <CardDescription>Update your public profile and app preferences.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onProfileSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> Email</Label>
                  <Input value={user?.email || ""} disabled className="bg-muted/50" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground" /> Display Name</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your display name" disabled={isProfileSaving} />
                  <p className="text-[11px] text-muted-foreground">The name shown to others</p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground" /> Username</Label>
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" disabled={isProfileSaving} />
                  <p className="text-[11px] text-muted-foreground">3-20 characters, used as your unique identifier</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 text-muted-foreground" /> Auto-save</Label>
                    <Select value={autosaveMode} onValueChange={(val) => setAutosaveMode(val as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual only</SelectItem>
                        <SelectItem value="immediate">Auto after changes</SelectItem>
                        <SelectItem value="hourly">Auto hourly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Palette className="h-3.5 w-3.5 text-muted-foreground" /> Theme</Label>
                    <Select value={appTheme} onValueChange={(val) => { setAppTheme(val); setTheme(val); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark">🌙 Dark</SelectItem>
                        <SelectItem value="light">☀️ Light</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" disabled={isProfileSaving} className="w-full sm:w-auto">
                  <Save className="mr-2 h-4 w-4" /> Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Salary Tab */}
        <TabsContent value="salary">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Salary & KPI Settings</CardTitle>
              <CardDescription>Configure your compensation details for salary estimation.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSalarySave} className="space-y-5">
                {/* Primary Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><DollarSign className="h-3.5 w-3.5 text-muted-foreground" /> Base Salary</Label>
                    <Input type="number" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} placeholder="e.g. 5000" step="0.01" min="0" />
                    <p className="text-[11px] text-muted-foreground">Gross monthly salary</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">KPI % of Salary</Label>
                    <Input type="number" value={kpiPercentage} onChange={(e) => setKpiPercentage(e.target.value)} placeholder="70" step="0.01" min="0" max="100" />
                    <p className="text-[11px] text-muted-foreground">KPI pool percentage</p>
                  </div>
                </div>

                {/* Allowances */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" /> Allowances
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1 col-span-2 sm:col-span-2">
                      <Label className="text-xs flex items-center gap-1"><Bus className="h-3 w-3" /> Transport</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={transportAllowance} onChange={(e) => setTransportAllowance(e.target.value)} placeholder="0" step="0.01" min="0" disabled={!transportApplied} className="flex-1" />
                        <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer whitespace-nowrap">
                          <input type="checkbox" checked={transportApplied} onChange={(e) => setTransportApplied(e.target.checked)} className="cursor-pointer" />
                          Applied
                        </label>
                      </div>
                      {!transportApplied && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">Transport not applied — counted as 0 in salary calc</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Wifi className="h-3 w-3" /> Internet</Label>
                      <Input type="number" value={internetAllowance} onChange={(e) => setInternetAllowance(e.target.value)} placeholder="0" step="0.01" min="0" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Award className="h-3 w-3" /> Senior</Label>
                      <Input type="number" value={seniorBonus} onChange={(e) => setSeniorBonus(e.target.value)} placeholder="0" step="0.01" min="0" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Languages className="h-3 w-3" /> Language</Label>
                      <Input type="number" value={languageAllowance} onChange={(e) => setLanguageAllowance(e.target.value)} placeholder="0" step="0.01" min="0" />
                    </div>
                  </div>
                </div>

                {/* Payment Timing */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Payment Timing
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Payment Day (1-31)</Label>
                      <Input type="number" value={salaryPaymentDay} onChange={(e) => setSalaryPaymentDay(e.target.value)} placeholder="27" min="1" max="31" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Salary Delay (Months)</Label>
                      <Input type="number" value={salaryDelayMonths} onChange={(e) => setSalaryDelayMonths(e.target.value)} placeholder="1" min="0" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">KPI Delay (Months)</Label>
                      <Input type="number" value={kpiDelayMonths} onChange={(e) => setKpiDelayMonths(e.target.value)} placeholder="2" min="0" />
                    </div>
                  </div>
                </div>

                {/* Loyalty Bonus Settings */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Loyalty Bonus Settings
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Employee Type</Label>
                      <Select value={employeeType} onValueChange={setEmployeeType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New Joiner (Passed probation AFTER Sep 2025)</SelectItem>
                          <SelectItem value="old">Old Employee (Passed probation BEFORE Oct 2025)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {employeeType === 'new' && (
                      <div className="space-y-2 animate-fade-in">
                        <Label className="text-xs">Start Month</Label>
                        <Input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
                      </div>
                    )}
                  </div>
                  {employeeType === 'new' && (
                    <div className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-md space-y-2 animate-fade-in">
                      <Label className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        Unknown start month? Derive it from your first bonus date
                      </Label>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        Select the month you received (or will receive) your FIRST 50% Loyalty Bonus:
                      </p>
                      <Input type="month" value={knownBonusMonth} onChange={(e) => handleKnownBonusMonthChange(e.target.value)} className="h-8 max-w-[200px] text-xs" />
                      {startMonth && (
                        <p className="text-[11px] font-medium text-foreground">
                          Calculated Start Month: <span className="font-bold font-mono">{startMonth}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Tax */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive" /> Deductions
                  </h4>
                  <div className="max-w-xs">
                    <Label className="text-xs">Tax & Insurance Rate (%)</Label>
                    <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="e.g. 14.5" step="0.01" min="0" max="100" />
                  </div>
                </div>

                {/* Formula Info */}
                <Card className="p-3 bg-muted/30 border-dashed">
                  <p className="text-xs font-medium text-muted-foreground mb-1">💡 Salary Formula:</p>
                  <p className="text-[11px] text-muted-foreground">KPI Bonus = Base × KPI% × Score</p>
                  <p className="text-[11px] text-muted-foreground">Gross = Base + KPI + Allowances</p>
                  <p className="text-[11px] text-muted-foreground">Net = Gross × (1 - Tax%)</p>
                </Card>

                <Button type="submit" disabled={isSalarySaving} className="w-full sm:w-auto">
                  <Save className="mr-2 h-4 w-4" /> {isSalarySaving ? "Saving..." : "Save Salary Settings"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Floor Averages Tab */}
        <TabsContent value="floor">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" /> Floor Averages
              </CardTitle>
              <CardDescription>
                Set manual floor average values for each metric. If set, these override the computed team averages shown on the dashboard.
                Leave a field empty to use the computed team average from the sheet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onFloorSave} className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Productivity %</Label>
                    <Input type="number" step="0.1" min="0" max="100" value={faProductivity} onChange={(e) => setFaProductivity(e.target.value)} placeholder="e.g. 75" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">CSAT %</Label>
                    <Input type="number" step="0.1" min="0" max="100" value={faCsat} onChange={(e) => setFaCsat(e.target.value)} placeholder="e.g. 88" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">AHT (sec)</Label>
                    <Input type="number" step="0.1" min="0" value={faAht} onChange={(e) => setFaAht(e.target.value)} placeholder="e.g. 360" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Close Rate %</Label>
                    <Input type="number" step="0.1" min="0" max="100" value={faCloseRate} onChange={(e) => setFaCloseRate(e.target.value)} placeholder="e.g. 75" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">FCR %</Label>
                    <Input type="number" step="0.1" min="0" max="100" value={faFcr} onChange={(e) => setFaFcr(e.target.value)} placeholder="e.g. 70" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Escalation Rate %</Label>
                    <Input type="number" step="0.1" min="0" max="100" value={faEscalationRate} onChange={(e) => setFaEscalationRate(e.target.value)} placeholder="e.g. 5" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Adherence %</Label>
                    <Input type="number" step="0.1" min="0" max="100" value={faAdherence} onChange={(e) => setFaAdherence(e.target.value)} placeholder="e.g. 85" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">IRT Replier (sec)</Label>
                    <Input type="number" step="0.1" min="0" value={faIrtReplier} onChange={(e) => setFaIrtReplier(e.target.value)} placeholder="e.g. 45" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Closed After Resolution %</Label>
                    <Input type="number" step="0.1" min="0" max="100" value={faClosedAfterResolution} onChange={(e) => setFaClosedAfterResolution(e.target.value)} placeholder="e.g. 80" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">De-escalation Rate %</Label>
                    <Input type="number" step="0.1" min="0" max="100" value={faDeescalationRate} onChange={(e) => setFaDeescalationRate(e.target.value)} placeholder="e.g. 60" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Occupancy %</Label>
                    <Input type="number" step="0.1" min="0" max="100" value={faOccupancy} onChange={(e) => setFaOccupancy(e.target.value)} placeholder="e.g. 70" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Avg Group Basket Time (sec)</Label>
                    <Input type="number" step="0.1" min="0" value={faAvgGroupBasketTime} onChange={(e) => setFaAvgGroupBasketTime(e.target.value)} placeholder="e.g. 360" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Break Exceed</Label>
                    <Input type="number" step="0.1" min="0" value={faBreakExceed} onChange={(e) => setFaBreakExceed(e.target.value)} placeholder="e.g. 2" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Idle Time</Label>
                    <Input type="number" step="0.1" min="0" value={faIdleTime} onChange={(e) => setFaIdleTime(e.target.value)} placeholder="e.g. 15" />
                  </div>
                </div>

                <Card className="p-3 bg-muted/30 border-dashed">
                  <p className="text-xs text-muted-foreground">
                    💡 <strong>How it works:</strong> When you set a floor average value here, the dashboard will compare your metrics against this value instead of the computed team average from the sheet. Leave a field empty to fall back to the automatic team average.
                  </p>
                </Card>

                <Button type="submit" disabled={isFloorSaving} className="w-full sm:w-auto">
                  <Save className="mr-2 h-4 w-4" /> {isFloorSaving ? "Saving..." : "Save Floor Averages"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Change Password</CardTitle>
              <CardDescription>Set a local password for your account. Stored on this device only.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onPasswordSubmit} className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <div className="relative">
                    <Input type={showOldPassword ? "text" : "password"} value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)} placeholder="••••••••" disabled={isPasswordLoading} />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-10"
                      onClick={() => setShowOldPassword(!showOldPassword)}>
                      {showOldPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="relative">
                    <Input type={showNewPassword ? "text" : "password"} value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" disabled={isPasswordLoading} />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-10"
                      onClick={() => setShowNewPassword(!showNewPassword)}>
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Min 8 chars, with uppercase, lowercase & digit</p>
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <Input type="password" value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" disabled={isPasswordLoading} />
                </div>
                <Button type="submit" disabled={isPasswordLoading} className="w-full sm:w-auto">
                  <Lock className="mr-2 h-4 w-4" /> Update Password
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  ⚠️ Password is stored locally on this device. In local mode, there is no server-side authentication.
                </p>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}