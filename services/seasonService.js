const { getCurrentGoldPassSeason } = require("./clashApi");

function parseClashDate(dateString) {
  if (!dateString) return null;

  const formatted = dateString.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
    "$1-$2-$3T$4:$5:$6"
  );

  return new Date(formatted);
}

function getTimeRemaining(endDate) {
  const now = new Date();
  const diffMs = endDate - now;

  if (diffMs <= 0) {
    return "Season ended";
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);

  return `${days}d ${hours}h ${minutes}m`;
}

async function getSeasonCountdown() {
  const season = await getCurrentGoldPassSeason();
  const endDate = parseClashDate(season.endTime);

  return {
    ...season,
    endDate,
    timeRemaining: getTimeRemaining(endDate)
  };
}

module.exports = {
  getSeasonCountdown
};