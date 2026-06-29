(function () {
  const modal = document.getElementById("playerScorecardModal");

  if (!modal) return;

  const title = document.getElementById("playerScorecardTitle");
  const tag = document.getElementById("playerScorecardTag");
  const rank = document.getElementById("playerScorecardRank");
  const details = document.getElementById("playerScorecardDetails");
  const scores = document.getElementById("playerScorecardScores");
  const decision = document.getElementById("playerScorecardDecision");
  const summary = document.getElementById("playerScorecardSummary");
  const overrideTag = document.getElementById("playerOverrideTag");
  const overrideDestination = document.getElementById("playerOverrideDestination");

  function addDetail(label, value) {
    const labelElement = document.createElement("span");
    const valueElement = document.createElement("strong");
    labelElement.textContent = label;
    valueElement.textContent = value;
    details.append(labelElement, valueElement);
  }

  function addScore(label, value) {
    const item = document.createElement("span");
    const valueElement = document.createElement("strong");
    item.append(`${label} `, valueElement);
    valueElement.textContent = value;
    scores.appendChild(item);
  }

  modal.addEventListener("show.bs.modal", (event) => {
    const row = event.relatedTarget;

    if (!row) return;

    const player = row.dataset;
    title.textContent = player.name;
    tag.textContent = player.tag;
    rank.textContent = player.rank;
    details.replaceChildren();
    scores.replaceChildren();

    addDetail("Town Hall", player.th);
    addDetail("Home clan", player.home);
    addDetail("Assigned CWL clan", player.assigned);
    addDetail("Regular lineup", `${player.regRank} → ${player.regClan}`);
    addDetail("CWL lineup", `${player.cwlRank} → ${player.cwlClan}`);
    addDetail("Regular sample", `${player.regWars} wars / ${player.regAttacks} attacks / ${player.regMissed} missed`);
    addDetail("CWL sample", `${player.cwlWars} wars / ${player.cwlAttacks} attacks / ${player.cwlMissed} missed`);
    addDetail("Regular performance", `${player.regStars} stars / ${player.regDest} destruction / ${player.regThDistance} TH distance`);
    addDetail("CWL performance", `${player.cwlStars} stars / ${player.cwlDest} destruction / ${player.cwlThDistance} TH distance`);

    addScore("Combined", player.mainScore);
    addScore("Regular", player.regScore);
    addScore("CWL", player.cwlScore);

    decision.textContent = `${player.decision}.`;
    summary.textContent = player.summary;
    overrideTag.value = player.tag;
    overrideDestination.value = player.override;
  });

  document.querySelectorAll(".js-player-scorecard-row").forEach((row) => {
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      row.click();
    });
  });
})();
