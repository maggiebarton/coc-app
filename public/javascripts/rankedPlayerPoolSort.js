(() => {
  const sortSelect = document.getElementById("rankedPlayerPoolSort");
  const tableBody = document.querySelector("#rankedPlayerPoolTable tbody");

  if (!sortSelect || !tableBody) return;

  const rows = Array.from(tableBody.rows);
  rows.forEach((row, index) => {
    row.dataset.originalIndex = String(index);
  });

  const numericValue = (row, key, fallback = Number.POSITIVE_INFINITY) => {
    const value = Number.parseInt(row.dataset[key], 10);
    return Number.isNaN(value) ? fallback : value;
  };

  const compareOriginalOrder = (a, b) =>
    numericValue(a, "originalIndex") - numericValue(b, "originalIndex");

  const comparators = {
    rank: (a, b) =>
      numericValue(a, "rankValue") - numericValue(b, "rankValue"),
    "reg-rank": (a, b) =>
      numericValue(a, "regRankValue") - numericValue(b, "regRankValue"),
    "cwl-rank": (a, b) =>
      numericValue(a, "cwlRankValue") - numericValue(b, "cwlRankValue"),
    th: (a, b) => numericValue(b, "th", 0) - numericValue(a, "th", 0),
    assigned: (a, b) => {
      const aAssigned = a.dataset.assigned || "Unassigned";
      const bAssigned = b.dataset.assigned || "Unassigned";
      const aIsUnassigned = aAssigned === "Unassigned";
      const bIsUnassigned = bAssigned === "Unassigned";

      if (aIsUnassigned !== bIsUnassigned) return aIsUnassigned ? 1 : -1;
      return aAssigned.localeCompare(bAssigned, undefined, { sensitivity: "base" });
    },
  };

  sortSelect.addEventListener("change", () => {
    const compare = comparators[sortSelect.value] || comparators.rank;
    const sortedRows = [...rows].sort(
      (a, b) => compare(a, b) || compareOriginalOrder(a, b),
    );

    sortedRows.forEach((row) => tableBody.appendChild(row));
  });
})();
