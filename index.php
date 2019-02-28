<!DOCTYPE html>
<!--
To change this license header, choose License Headers in Project Properties.
To change this template file, choose Tools | Templates
and open the template in the editor.
-->

<html>
    <head>
        <meta charset="UTF-8">
        <link rel="stylesheet" type="text/css" href="styleBG.css">
        <title>SWolf D&D World</title>
    </head>
    <style>
        .error {color: #FF0000;}
    </style>
    <script>
        function openplayer() {
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
        echo "<form><input type=\"button\" value=\"Player\" onclick=\"openplayer()\"></form>";
        echo "<form><input type=\"button\" value=\"Game Master\" onclick=\"opengm()\"></form>";
        ?>

    </body>
</html>
