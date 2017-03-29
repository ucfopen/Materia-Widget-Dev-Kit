function hideSidebar() {
  var leftbar = document.getElementById("leftbar");
  var btn = document.getElementById("sidebarbtn");
  var center = document.querySelector(".center");

  if (leftbar.className) {
    leftbar.className = "";
    btn.innerHTML = "&larr;";
    center.className = "center"
  } else {
    leftbar.className = "shrink";
    btn.innerHTML = "&rarr;";
    center.className = "center full"
  }
}
