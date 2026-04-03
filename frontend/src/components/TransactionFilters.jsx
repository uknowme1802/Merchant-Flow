export default function TransactionFilters({search, setSearch, status, setStatus, sort, setSort}){
    return(
        <div className="flex justify-between mb-4">
            <input
            className="border rounded-lg p-2 w-64"
            placeholder="Search Transaction"
            value={search}
            onChange={(e)=>setSearch(e.target.value)}
            />
            <select className="border rounded-lg p-2"
                value={status}
                onChange={(e)=>setStatus(e.target.value)}
                >
                <option value="All">All</option>
                <option value="Pending">Pending</option>
                <option value="Success">Success</option>
                <option value="Failed">Failed</option>
            </select>
            <select className="border rounded-lg p-2"
            value={sort}
            onChange={(e)=>setSort(e.target.value)}
            >
                <option value="">Sort by</option>
                <option value="amount">Amount</option>
                <option value="date">Date</option>
            </select>
        </div>  
    )
}