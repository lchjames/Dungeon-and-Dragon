<?php
$page = $_SERVER['PHP_SELF'];
$sec = "60";
?>
<html>
    <head>
        <meta charset="UTF-8" http-equiv="refresh" content="<?php echo $sec ?>;URL='<?php echo $page ?>'">
        <link rel="stylesheet" type="text/css" href="styleBG.css">
        <title>角色狀態</title>
    </head>
    <body>
        <header>
            玩家資料
        </header>
        <?php
        include 'search.php';
        echo "<displayfield><p>力量: 你的角色執行推、拉、搬動等動作時所需的能力<br><br>
        敏捷: 代表你的肢體靈巧、協調、速度等，戰鬥時的先後順位<br><br>
        體質:這個包括了身體素質，活力和精力。可能是憋氣的多寡或是毒抗<br><br>
        外表: 會給人強烈的第一印象，好看的外表讓你更利於與NPC交涉<br><br>
        意志: 意志力堅強的人較不容易動搖，重要的SAN值也是依此決定<br><br>
        智力: 角色對事物的理解能力，但有時候知道太多並不是好事<br><br>
        體型: 體型大的人在肉搏戰可能佔有優勢，體型小也有行動便利的優點<br><br>
        教育: 通常70等於一般大學程度<br></p></displayfield>"
        ?>
    </body>
</html>
