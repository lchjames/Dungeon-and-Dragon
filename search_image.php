<?php
$pic_name = "";
$pic_nameErr = "";
$searchpic = FALSE;
if (isset($_POST['pic_search'])) {
    if (empty($_POST["pic_name"])) {
        $pic_nameErr = "Player's name is required";
        $searchpic = FALSE;
    }
}
if ($searchpic) {
    include 'get_image.php';
}

if (!$searchpic) {
    ?>
    <inputfield>
        <form method="post" action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>" autocomplete="off">  
            圖片名稱: <input type="text" name="pic_name">
            <span class="error">* <?php echo $pic_nameErr; ?></span><br>
            <input type="submit" name="pic_search" value="圖片搜索">  
        </form>
    </inputfield>
    <?php
}
?>