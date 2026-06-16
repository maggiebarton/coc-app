//services/cwlService.js
function normalizeTag(tag) {
    return tag?.replace("#", "").toUpperCase();
  }
  
  function getCwlWarSides(war, clanTag) {
    const targetTag = normalizeTag(clanTag);
    const clanTagA = normalizeTag(war.clan?.tag);
    const clanTagB = normalizeTag(war.opponent?.tag);
  
    if (clanTagA === targetTag) {
      return {
        clanSide: war.clan,
        opponentSide: war.opponent
      };
    }
  
    if (clanTagB === targetTag) {
      return {
        clanSide: war.opponent,
        opponentSide: war.clan
      };
    }
  
    return null;
  }
  
  function createMemberLookup(members = []) {
    return new Map(members.map(member => [member.tag, member]));
  }
  
  function mapCwlToAttackRows(cwlData, clanTag, clanKey = null) {
    const rows = [];
  
    for (const round of cwlData.rounds || []) {
      for (const war of round.warTags || []) {
        const sides = getCwlWarSides(war, clanTag);
  
        if (!sides) continue;
  
        const { clanSide, opponentSide } = sides;
        const opponentLookup = createMemberLookup(opponentSide?.members || []);
  
        for (const attacker of clanSide?.members || []) {
          for (const attack of attacker.attacks || []) {
            const defender = opponentLookup.get(attack.defenderTag);
  
            rows.push({
              clanKey,
              season: cwlData.season,
              warTag: war.tag,
              warEndTime: war.endTime,
  
              clanTag: clanSide.tag,
              clanName: clanSide.name,
              opponentClanTag: opponentSide?.tag,
              opponentClanName: opponentSide?.name,
  
              attackerTag: attacker.tag,
              attackerName: attacker.name,
              attackerTownhallLevel: attacker.townhallLevel,
              attackerMapPosition: attacker.mapPosition,
  
              defenderTag: attack.defenderTag,
              defenderName: defender?.name || null,
              defenderTownhallLevel: defender?.townhallLevel || null,
              defenderMapPosition: defender?.mapPosition || null,
  
              stars: attack.stars,
              destructionPercentage: attack.destructionPercentage,
              duration: attack.duration,
              attackOrder: attack.order,
  
              townhallDifference: defender
                ? defender.townhallLevel - attacker.townhallLevel
                : null,
  
              mapPositionDifference: defender
                ? defender.mapPosition - attacker.mapPosition
                : null
            });
          }
        }
      }
    }
  
    return rows;
  }
  
  module.exports = {
    mapCwlToAttackRows
  };