(function () {
  function normalizeCell(value) {
    return value.replace(/\s+/g, " ").replace(/`/g, "'").trim();
  }

  function padCell(value, width, alignRight) {
    return alignRight ? value.padStart(width) : value.padEnd(width);
  }

  function buildTable(card) {
    const roster = card.querySelector(".js-cwl-roster");
    const meta = normalizeCell(card.querySelector(".js-cwl-roster-meta").textContent);
    const rows = Array.from(card.querySelectorAll(".js-cwl-roster-player")).map((row) => [
      normalizeCell(row.querySelector(".js-cwl-rank").textContent),
      normalizeCell(row.querySelector(".js-cwl-player-name").textContent),
      normalizeCell(row.querySelector(".js-cwl-town-hall").textContent),
      normalizeCell(row.querySelector(".js-cwl-home-clan").textContent)
    ]);
    const headers = ["Rank", "Player", "TH", "Home clan"];
    const widths = headers.map((header, columnIndex) =>
      Math.max(header.length, ...rows.map((row) => row[columnIndex].length))
    );
    const formatRow = (row) => row
      .map((cell, columnIndex) => padCell(cell, widths[columnIndex], columnIndex === 0 || columnIndex === 2))
      .join(" | ");
    const separator = widths.map((width) => "-".repeat(width)).join("-+-");
    const clanName = normalizeCell(roster.dataset.clanName);

    return [
      `**${clanName} CWL roster**`,
      meta,
      "```",
      formatRow(headers),
      separator,
      ...rows.map(formatRow),
      "```"
    ].join("\n");
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();

    if (!copied) {
      throw new Error("Clipboard copy failed");
    }
  }

  function orderRoster(card, orderBy) {
    const body = card.querySelector(".js-cwl-roster tbody");
    const rows = Array.from(body.querySelectorAll(".js-cwl-roster-player"));

    rows.sort((first, second) => {
      const rankDifference = Number(first.dataset.rankValue) - Number(second.dataset.rankValue);

      if (orderBy === "townHall") {
        const townHallDifference = Number(second.dataset.th) - Number(first.dataset.th);
        return townHallDifference || rankDifference;
      }

      return rankDifference;
    });

    rows.forEach((row) => body.appendChild(row));
  }

  document.querySelectorAll(".js-cwl-roster-order").forEach((select) => {
    select.addEventListener("change", () => {
      orderRoster(select.closest(".clan-card"), select.value);
    });
  });

  document.querySelectorAll(".js-copy-cwl-roster").forEach((button) => {
    button.addEventListener("click", async () => {
      const originalLabel = button.textContent.trim();
      button.disabled = true;

      try {
        await copyText(buildTable(button.closest(".clan-card")));
        button.textContent = "Copied!";
      } catch (error) {
        button.textContent = "Copy failed";
      }

      window.setTimeout(() => {
        button.textContent = originalLabel;
        button.disabled = false;
      }, 1800);
    });
  });
})();
