# Simple Family Tree ([中文](#家谱应用程序))

![Family Tree Example](examples/example.png)

This is a client-side family tree application built using HTML, CSS, and JavaScript. 
## Completely local and private!



### Features

- Load and save family tree data in JSON format
- Add new people to the family tree
- Search for people by name
- View and edit person details
- Add and edit person names and events
- Visualize the family tree in a hierarchical layout

### How to Use

Download the repository to your local folder, then click on the index.html file

1. Use the "Add New Person" button to add new people to the family tree.
2. Or load a family tree file (see examples/example_ft_1.json) in JSON format using the "Load Family Tree" button.
3. Use the search bar to find people by name.
4. Click on a person in the graph or search results to view and edit their details.
5. Use the "Save" button to save the current family tree data. 
   <br>However, the file is saved in the "download" folder!
6. Convert the JSON file to SVG file for visualisation and printing
   <br>run: python Zupu_json2svg.py --input XFamily_tree.json --output XFamily_family.svg --surname Thomas
   <br>open the SVG file with any web browser

### Technologies Used

- HTML
- CSS
- JavaScript
- Cytoscape.js
- dagre

### Author

This application was created by [Cursor/VS Code] guided by <a href="mailto:tqye@yahoo.com">TQ Ye</a>.

---

# 简易家谱

这是一个使用HTML、CSS和JavaScript构建的客户端家族谱应用程序。
## 完全本地运行本地储存，确保私密！
---

### 特点

- 加载和保存家谱数据在JSON格式
- 向家谱中添加新的人
- 按姓名搜索人
- 查看和编辑人详细信息
- 添加和编辑人姓名和事件
- 以层次结构布局可视化家谱

### 使用方法

将存储库下载到本地一文件夹，然后单击 index_zw.html 文件。

1. 使用"添加新人"按钮向家谱中添加新的人。
2. 或使用"加载家谱"按钮加载JSON格式的家谱文件 (见examples/example_zupu.json)。
3. 使用搜索栏按姓名查找人。
4. 点击图表或搜索结果中的某个人来查看和编辑他们的详细信息。
5. 使用"保存"按钮下载当前家谱数据。<br>注意：下载的家谱文件不一定是你上载的文件夹！

6. 将JSON文件转换为SVG可视图：
   运行：>python Zupu_json2svg.py --input XFamily_tree.json --output XFamily_family.svg --surname 王
   在任何网页浏览器上即可打开 XFamily_family.svg


### 使用技术

- HTML
- CSS
- JavaScript
- Cytoscape.js
- dagre

### 作者

本应用程序由[Cursor/VS Code]根据<a href="mailto:tqye@yahoo.com">TQ Ye</a>的指导创建。
