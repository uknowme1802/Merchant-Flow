import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer
} from "recharts"

const data=[
    {name: "Card", value:400},
    {name: "UPI", value:980},
    {name: "Wallet", value:500},
    {name: "NetBanking", value:467  },
]

const COLORS=["#6366F1", "#22C55E", "#F59E0B", "#EF4444"]

export default function PaymentPieChart(){
    return (
        <div className="card h-80">
            <h2 className="text-lg font-semibold mb-4">Payment Methods</h2>

            <ResponsiveContainer width="100%" height="90%">
                <PieChart>
                    <Pie 
                    data={data}
                    dataKey="value"
                    outerRadius={100}
                    label
                    >
                        {data.map((entry, index)=>(
                            <Cell key={index} fill={COLORS[index]} />
                        ))}
                    </Pie>
                    <Tooltip />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}