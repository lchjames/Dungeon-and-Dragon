<?php
$pic_nameErr = "";
$searchpic = FALSE;
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    if (isset($_POST['update'])) {
        include_once 'updateplayer.php';
    } else if (isset($_POST['delete'])) {
        include_once 'deleteplayer.php';
    } else if (isset($_POST['pic_search'])) {
        if (empty($_POST["pic_name"])) {
            $pic_nameErr = "Input is required";
            $searchpic = FALSE;
        }
        $searchpic = TRUE;
    }
}
$page = $_SERVER['PHP_SELF'];
$sec = "60";
?>
<html>
    <head>
        <meta charset="UTF-8" http-equiv="refresh" content="<?php echo $sec ?>;URL='<?php echo $page ?>'">
        <link rel="stylesheet" type="text/css" href="styleBG.css">
        <title>SWolf D&D World</title>
    </head>
    <body>
        <header>
            玩家資料
        </header>
        <?php
        include 'getdata_GM.php';
        ?>
    </body>
</html>
