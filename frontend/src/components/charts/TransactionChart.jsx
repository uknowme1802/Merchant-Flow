import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer
} from "recharts"

const data=[
    {day:"mon", transactions:"6054"},
    {day:"tue", transactions:"8532"},
    {day:"wed", transactions:"4169"},
    {day:"thr", transactions:"5308"},
    {day:"fri", transactions:"3926"},
    {day:"sat", transactions:"6214"},
    {day:"sun", transactions:"2741"}
]

export default function TransactionChart(){
    return(
        <div className="card h-80">
            <h2 className="text-lg font-semibold mb-4">Weekly Transactions</h2>

            <ResponsiveContainer width="100%" height="90%">
                <BarChart data={data}>
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="transactions" fill="#6366F1" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}