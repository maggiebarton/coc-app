const ignoreTimResponses = [
    "Bold strategy. Tim will absolutely bring this up later.",
  
    "Interesting choice. Tim is currently outside your home with a carton of eggs and a concerning amount of free time.",
  
    "You've chosen violence. Tim is swapping your pinkies with your thumbs as we speak.",
  
    "Tim is disappointed. Not angry. Somehow that's worse.",
  
    "Congratulations. Tim just moved you to the top of his watchlist.",
  
    "Clan morale has decreased by 0.3%. Tim says it's your fault.",
  
    "Tim has informed Chuck Norris of your decision. Watch your step.",
  
    "Tim has started tracking your online status for completely normal reasons.",
  
    "A tiny violin begins playing somewhere in the distance for Tim.",
  
    "Tim just sighed dramatically and looked out a window.",
  
    "Tim has launched an internal investigation.",
  
    "Good luck getting Tim to donate troops to your clan castle after this.",
  
    "Your actions have consequences. Mostly Tim talking about them.",
  
    "Tim has submitted a formal complaint to... absolutely nobody.",
  
    "You monster."
  ];

document.addEventListener("DOMContentLoaded", () => {
    const modalElement = document.getElementById("timModal");

    if (!modalElement) return;

    const countElement = document.getElementById("timIgnoreCount");
    const responseElement = document.getElementById("timResponse");

    const buttonContainer = document.getElementById("timChoiceButtons");

    modalElement.addEventListener("show.bs.modal", () => {
        responseElement.classList.add("d-none");
        responseElement.textContent = "";
        buttonContainer.classList.remove("d-none");

        countElement.textContent =
            Math.floor(Math.random() * 51) + 50;
    });

    document.getElementById("stopIgnoringTim").addEventListener("click", () => {
        responseElement.textContent =
            "Correct choice. Go tell Tim good morning in clan chat.";
        responseElement.classList.remove("d-none");
        buttonContainer.classList.add("d-none");
    });

    document.getElementById("keepIgnoringTim").addEventListener("click", () => {
        responseElement.textContent =
          ignoreTimResponses[
            Math.floor(Math.random() * ignoreTimResponses.length)
          ];
      
        responseElement.classList.remove("d-none");
        buttonContainer.classList.add("d-none");
      });
});