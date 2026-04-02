import {
    Line,
    LineChart,
    Tooltip,
    XAxis,
    YAxis,
    CartesianGrid,
    ResponsiveContainer
} from "recharts";

const data =[
    {month:"Jan",revenue:968045},
    {month:"Feb",revenue:482913},
    {month:"Mar",revenue:760154},
    {month:"Apr",revenue:295671},
    {month:"May",revenue:831047},
    {month:"Jun",revenue:604829}
]

export default function RevenueChart(){
    return (
        <div className="card h-80">
            <h2 className="text-lg font-semibold mb-4">Revenue Overview</h2>

            <ResponsiveContainer width="100%" height="90%">
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3"/>
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip /> 
                    <Line
                    type="monotone"
                    dataKey="revenue"
                    strokeWidth={3}
                    />
                </LineChart>
            </ ResponsiveContainer>
        </div>
    );
}