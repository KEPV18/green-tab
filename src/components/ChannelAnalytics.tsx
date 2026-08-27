import { Card } from "@/components/ui/card";
import { Phone, MessageSquare, Mail } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";


interface ChannelData {
  phone: number;
  chat: number;
  email: number;
}

interface ChannelAnalyticsProps {
  goodRatings: ChannelData;
  badRatings: ChannelData;
  karmaRatings: ChannelData;
}

export const ChannelAnalytics = ({ goodRatings, badRatings, karmaRatings }: ChannelAnalyticsProps) => {

  const chartData = [
    {
      channel: "Phone",
      Good: goodRatings.phone,
      "DSAT": badRatings.phone,
      Karma: karmaRatings.phone,
    },
    {
      channel: "Chat",
      Good: goodRatings.chat,
      "DSAT": badRatings.chat,
      Karma: karmaRatings.chat,
    },
    {
      channel: "Email",
      Good: goodRatings.email,
      "DSAT": badRatings.email,
      Karma: karmaRatings.email,
    },
  ];

  const icons = {
    phone: Phone,
    chat: MessageSquare,
    email: Mail,
  };

  return (
    <Card className="p-6 border-border">
      <h3 className="text-lg font-semibold text-foreground mb-4">Channel Analytics</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {(["phone", "chat", "email"] as const).map((channel) => {
          const Icon = icons[channel];
          const good = goodRatings[channel];
          const bad = badRatings[channel];
          const total = good + bad;
          const goodPercent = total > 0 ? ((good / total) * 100).toFixed(1) : "0";

          return (
            <div key={channel} className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold text-foreground capitalize">{channel}</span>
              </div>
              <div className="space-y-2">
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground">Success Rate</p>
                  <p className="text-lg font-bold text-primary">{goodPercent}%</p>
                  <p className="text-xs text-muted-foreground">
                    {good} good / {bad} bad
                  </p>
                  {karmaRatings[channel] > 0 && (
                    <p className="text-xs text-warning">
                      +{karmaRatings[channel]} karma
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="channel" stroke="hsl(var(--muted-foreground))" />
            <YAxis stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
            />
            <Legend />
            <Bar dataKey="Good" fill="hsl(var(--success))" radius={[8, 8, 0, 0]} />
            <Bar dataKey="DSAT" fill="hsl(var(--destructive))" radius={[8, 8, 0, 0]} />
            <Bar dataKey="Karma" fill="hsl(var(--warning))" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
