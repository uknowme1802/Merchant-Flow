import Badge from "./ui/Badge";
import Card from "./ui/Card";

export default function TransactionTable({transactions}){
    return(
        <Card>
            <table className="w-full text-left">
                <thead className="border-b text-gray-500">
                    <tr>
                        <th className="pb-3">Transaction ID</th>
                        <th className="pb-3">Amount</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3">Date</th>
                    </tr>
                </thead>
                <tbody>
                    {transactions.map(tx=>(
                        <tr key={tx.id} className="border-b hover:bg-gray-50">
                            <td className="py-3">{tx.id}</td>
                            <td>{tx.amount}</td>
                            <td><Badge status={tx.status}/></td>
                            <td>{tx.date}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Card>
    ); 
}