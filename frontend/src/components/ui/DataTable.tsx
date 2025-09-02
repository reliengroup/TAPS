import { useRef } from "react";
import { motion } from "framer-motion";
import { buttonHover } from "../utils/motionVariants";
import Button from "./Button";

function getNestedValue(obj: any, accessor: string) {
  return accessor.split(".").reduce((acc, key) => acc?.[key], obj);
}

interface DataTableInterface {
  columns: any[];
  data: any[];
  title: string;
  onAddClick?: (data: any) => void;
  onRowClick: (data: any) => void;
  total?: number;
  totalDays?: number;
  totalCash?: number;
  totalPayroll?: number;
}

const DataTable = ({
  columns,
  data,
  title,
  onAddClick,
  onRowClick,
  total,
  totalCash,
  totalPayroll,
}: DataTableInterface) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Shift + mouse wheel pans horizontally (default wheel remains vertical)
  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    const el = scrollRef.current;
    if (!el) return;
    if (e.shiftKey && el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY; // horizontal pan
      e.preventDefault();
    }
  };

  return (
    <motion.div className="p-6 bg-white shadow-card rounded-xl">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <h2 className="text-2xl font-semibold">{title}</h2>

        <div className="ml-auto flex flex-col items-end ">
          <div className="flex gap-2">
           {totalCash !== undefined && (
              <p className="text-lg">
                <span className="font-bold">Total cash: </span>
                {"$" + totalCash + ","}
              </p>
            )}
            {totalPayroll !== undefined && (
              <p className="text-lg">
                <span className="font-bold">Total payroll: </span>
                {"$" + totalPayroll + ","}
              </p>
            )}
            {total !== undefined && (
              <p className="text-lg">
                <span className="font-bold">Total amount: </span>
                {"$" + total}
              </p>
            )}
          </div>
          <span className="hidden lg:block text-xs text-gray-500">
            Tip: Hold <kbd className="px-1 border rounded">Shift</kbd> and
            scroll to pan horizontally
          </span>

          {onAddClick && (
            <motion.div {...buttonHover}>
              <Button onClick={onAddClick} className="bg-accent">
                Add {title}
              </Button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Responsive scroll container:
         - max width on large screens
         - both-axis scrolling enabled
         - vertical wheel scroll inside, horizontal via Shift+wheel */}
      <div
        ref={scrollRef}
        onWheel={onWheel}
        className="overflow-auto rounded-lg border border-gray-100"
        style={{ maxHeight: "70vh" }}
      >
        <table
          className={`table-fixed ${total === undefined ? "w-full" : ""} min-w-[720px]`}
        >
          <thead className="bg-gray-200  sticky top-0 z-10">
            <tr>
              {columns.map((col: any, index: number) => (
                <th
                  key={index}
                  className=" text-left p-2 sm:p-3 text-xs sm:text-sm font-semibold text-gray-700 break-words"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {data.map((row: any, rowIndex: number) => (
              <tr
                key={rowIndex}
                className={`cursor-pointer transition-colors hover:bg-gray-100
                  ${row.employeePosition === "Driver" ? "bg-gray-50" : ""}
                  ${row.employeePosition === "Aid" ? "bg-gray-200" : ""}
                `}
                onClick={() => onRowClick && onRowClick(row)}
              >
                {columns.map((col: any, colIndex: number) => (
                  <td
                    key={colIndex}
                    className="p-2 sm:p-3 border-t text-gray-700 text-sm break-words whitespace-normal"
                    // Optional: constrain extremely long content per cell
                    style={{ maxWidth: 280 }}
                  >
                    {col.cell
                      ? col.cell(row)
                      : String(getNestedValue(row, col.accessor))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};

export default DataTable;
