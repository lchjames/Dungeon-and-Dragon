<html>
    <head>
        <meta charset="UTF-8">
        <link rel="stylesheet" type="text/css" href="styleBG.css">
        <title>SWolf D&D World</title>
    </head>
    <script>
        function opennewplayer() {
            window.open("newplayer.php", "_self");
        }
        function openexistplayer() {
            window.open("player.php", "_self");
        }
        function opengm() {
            window.open("gamemaster.php", "_self");
        }
    </script>
    <body>
        <?php
        echo "I am:";
        echo "<br>";
        echo "<form><input type=\"button\" value=\"New Player\" onclick=\"opennewplayer()\"></form>";
        echo "<form><input type=\"button\" value=\"Exist Player\" onclick=\"openexistplayer()\"></form>";
        echo "<form><input type=\"button\" value=\"Game Master\" onclick=\"opengm()\"></form>";
        ?>

    </body>
</html>
